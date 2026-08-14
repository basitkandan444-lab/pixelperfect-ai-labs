import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, UploadCloud, Wand2, Download, RotateCcw, Zap, Gauge } from "lucide-react";

import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { CompareSlider } from "@/components/CompareSlider";
import { SiteFooter } from "@/components/SiteFooter";
import { HomeContent } from "@/components/HomeContent";
import { HomeTopSections } from "@/components/HomeTopSections";
import { HeroVisual } from "@/components/HeroVisual";
import { BeforeAfterGallery } from "@/components/BeforeAfterGallery";
import { AnalysisCard } from "@/components/AnalysisCard";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { UpgradeWall } from "@/components/UpgradeWall";
import { trackEvent } from "@/lib/analytics";
import { SITE, FAQS, absoluteUrl } from "@/lib/site";
import { originLoader } from "@/lib/origin.functions";
import { detectCapabilities } from "@/lib/enhance/capabilities";
import { useSession } from "@/hooks/use-session";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { consumeEnhancement, getMyEntitlement } from "@/lib/subscription.functions";
import { createPaddleCheckoutSession } from "@/lib/paddle.server";
import { FREE_CAP, getLocalUsed, incrementLocalUsed } from "@/lib/entitlement";

import {
  predict,
  recordOutcome,
  adjustRemainingMs,
  confidencePercent,
  stageForProgress,
  type ProcessingStage,
} from "@/lib/enhance/predictor";
// The browser enhancement engine (+ its worker) is lazy-loaded on first use so
// it never weighs down the initial page bundle — see the dynamic import in
// `enhance()` below.

export const Route = createFileRoute("/")({
  component: Index,
  loader: originLoader,
  head: ({ loaderData }) => {
    const canonical = absoluteUrl(loaderData?.origin, "/");
    return {
      meta: [
        { property: "og:url", content: canonical },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: SITE.name,
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web",
            description: SITE.description,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        },
      ],
    };
  },
});

type Scale = "4k" | "8k";
type Engine = "classical" | "neural";
type Stage = "idle" | "ready" | "loading" | "done";

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;

// Whether a picked file is an accepted image. Safari/WebKit (and some OS file
// pickers / drag-drop sources) report an empty `file.type`, so fall back to the
// filename extension instead of rejecting a perfectly valid image.
function isAcceptedImage(file: File): boolean {
  if (file.type) return ACCEPTED.includes(file.type);
  return ACCEPTED_EXT.test(file.name);
}

function Index() {
  const [stage, setStage] = useState<Stage>("idle");
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [resultInfo, setResultInfo] = useState<{
    width: number;
    height: number;
    durationMs: number;
    path: "worker" | "main" | "neural";
  } | null>(null);
  const [scale, setScale] = useState<Scale>("4k");
  const [engine, setEngine] = useState<Engine>("classical");
  const [neuralAvailable, setNeuralAvailable] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Preparing local AI engine…");
  const [etaTotalMs, setEtaTotalMs] = useState(0);
  const [etaRemainingMs, setEtaRemainingMs] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [fileInfo, setFileInfo] = useState<{ bytes: number; type: string } | null>(null);
  const [deviceTier, setDeviceTier] = useState<"high" | "medium" | "low">("medium");
  const [accelLabel, setAccelLabel] = useState("GPU acceleration");
  const [neuralWarm, setNeuralWarm] = useState(false);
  const [procStage, setProcStage] = useState<ProcessingStage>("preparing");
  const [runAccuracy, setRunAccuracy] = useState(97);
  // Bumped after every completed run so the pre-run prediction re-reads the
  // freshly calibrated store and shows an improved estimate/confidence.
  const [calibrationVersion, setCalibrationVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const dimensionsRef = useRef<{ w: number; h: number } | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const neuralWarmRef = useRef(false);
  const progressRef = useRef(0);
  const runBaseMsRef = useRef(0);

  // ---- Task 4: Free-tier gating + upgrade wall -----------------------------
  const navigate = useNavigate();
  const entitlementFn = useServerFn(getMyEntitlement);
  const consumeFn = useServerFn(consumeEnhancement);
  const checkoutFn = useServerFn(createPaddleCheckoutSession);
  const [wallOpen, setWallOpen] = useState(false);
  const [wallPending, setWallPending] = useState(false);
  const [localUsed, setLocalUsed] = useState(0);

  const sessionQuery = useSession();
  const isSignedIn = !!sessionQuery.data;
  const billingStatus = useBillingStatus();
  const billingAvailable = billingStatus.data?.configured ?? true;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement"],
    queryFn: () => entitlementFn({}),
    enabled: isSignedIn,
    staleTime: 30_000,
  });
  const isPremium = entitlementQuery.data?.isPremium ?? false;
  const serverUsed = entitlementQuery.data?.used ?? 0;
  const usedCount = isSignedIn ? serverUsed : localUsed;
  const remaining = Math.max(0, FREE_CAP - usedCount);

  useEffect(() => {
    setLocalUsed(getLocalUsed());
  }, []);

  const openUpgradeWall = useCallback(() => {
    setWallOpen(true);
    trackEvent("upgrade_wall_shown", { used: usedCount, cap: FREE_CAP, signedIn: isSignedIn });
  }, [usedCount, isSignedIn]);

  const handleUpgrade = useCallback(async () => {
    trackEvent("upgrade_wall_cta", { signedIn: isSignedIn });
    if (!billingAvailable) {
      toast.error("Premium checkout is temporarily unavailable. Please try again shortly.");
      return;
    }
    if (!isSignedIn) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    try {
      setWallPending(true);
      const { url } = await checkoutFn({});
      if (url) window.location.href = url;
      else toast.error("Checkout URL missing");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setWallPending(false);
    }
  }, [isSignedIn, navigate, checkoutFn, billingAvailable]);

  // Signal that React has hydrated and the upload handler is attached. The
  // server-rendered <input> exists before hydration, so a file set in that
  // window is silently dropped; consumers (and E2E specs) can wait for this
  // marker instead of retrying the whole upload.
  useEffect(() => {
    setHydrated(true);
    const caps = detectCapabilities();
    setDeviceTier(caps.tier);
    setAccelLabel(caps.accelLabel);
  }, []);

  // Detect whether the neural (GPU) engine can run acceptably in this browser.
  // Client-only: navigator.gpu is not present during SSR. When unavailable we
  // never offer neural (the WASM fallback is too slow to be worth surfacing).
  useEffect(() => {
    // Never trace the neural engine (and its heavy WASM/onnxruntime deps) into
    // the SSR / Cloudflare Worker bundle: `import.meta.env.SSR` is a build-time
    // constant, so Rollup dead-code-eliminates this dynamic import from the
    // server build. workerd cannot initialise onnxruntime-web and would 500.
    if (import.meta.env.SSR) return;
    let cancelled = false;
    import("@/lib/enhance/neural")
      .then(({ neuralSupported }) => {
        if (cancelled) return;
        const supported = neuralSupported();
        setNeuralAvailable(supported);
        // Neural (on-device AI) is the default when the device can run it.
        if (supported) setEngine((e) => (e === "classical" ? "neural" : e));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Abort any in-flight enhancement if the component unmounts.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const clearResultUrl = useCallback(() => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
  }, []);

  const loadFile = useCallback((file: File) => {
    if (!isAcceptedImage(file)) {
      toast.error("Unsupported format. Please upload a JPG, PNG or WEBP image.");
      trackEvent("upload_start", {
        ok: false,
        error_code: "unsupported_format",
        format: file.type || "unknown",
        size: file.size,
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large. Maximum size is 15MB.");
      trackEvent("upload_start", {
        ok: false,
        error_code: "too_large",
        format: file.type || "unknown",
        size: file.size,
      });
      return;
    }
    trackEvent("upload_start", { format: file.type, size: file.size });
    const readStartedAt = Date.now();
    const reader = new FileReader();
    reader.onerror = () => {
      toast.error("Could not read that file. Please try another image.");
      trackEvent("upload", {
        ok: false,
        error_code: "read_failed",
        format: file.type,
        size: file.size,
        durationMs: Date.now() - readStartedAt,
      });
    };
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setOriginal(dataUrl);
      clearResultUrl();
      setResult(null);
      setResultInfo(null);
      setStage("ready");
      setFileInfo({ bytes: file.size, type: file.type || "" });
      toast.success("Image ready. Choose a quality and enhance it.");
      trackEvent("upload", {
        ok: true,
        format: file.type,
        size: file.size,
        durationMs: Date.now() - readStartedAt,
      });

      // Capture natural dimensions so we can estimate the enhancement time as
      // soon as the user presses Enhance (used by the live countdown clock).
      const probe = new Image();
      probe.onload = () => {
        const d = { w: probe.naturalWidth, h: probe.naturalHeight };
        dimensionsRef.current = d;
        setDims(d);
      };
      probe.src = dataUrl;

      // Warm the neural engine in the background right after upload: this pays
      // the one-time model + runtime download/init cost NOW (while the user is
      // choosing options) instead of during the enhancement wait, so pressing
      // Enhance goes straight to inference. Purely on-device; failures are safe.
      if (!import.meta.env.SSR && !neuralWarmRef.current) {
        import("@/lib/enhance/neural")
          .then(({ warmUpNeural }) => warmUpNeural())
          .then((ok) => {
            neuralWarmRef.current = ok;
            setNeuralWarm(ok);
          })
          .catch(() => {});
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const enhance = useCallback(async () => {
    // Client-only: keep the enhancement engine (canvas/worker + optional neural
    // WASM) out of the SSR / Cloudflare Worker bundle. Guarding with the
    // build-time `import.meta.env.SSR` constant lets Rollup drop the dynamic
    // `import()` below from the server build so workerd never tries to load it.
    if (import.meta.env.SSR) return;
    if (!original) return;

    // Task 4 — Free tier gate. Premium bypasses. Signed-in users are gated
    // server-side (SECURITY DEFINER consume_free_enhancement). Anonymous
    // visitors are gated locally as UX only; the server-side path is the
    // security boundary once signed in.
    if (!isPremium) {
      if (isSignedIn) {
        try {
          const { allowed } = await consumeFn({});
          if (!allowed) {
            openUpgradeWall();
            return;
          }
        } catch (err) {
          console.warn("[entitlement] consume failed", err);
          // Fail closed — never let a broken check silently unlock unlimited use.
          toast.error("Could not verify your plan. Please try again.");
          return;
        }
        // Refresh the entitlement badge in the background.
        entitlementQuery.refetch();
      } else {
        if (getLocalUsed() >= FREE_CAP) {
          openUpgradeWall();
          return;
        }
        setLocalUsed(incrementLocalUsed());
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(4);
    progressRef.current = 4;
    setProcStage("preparing");
    setStatusMessage("Preparing local AI engine…");
    setStage("loading");
    const dims = dimensionsRef.current;
    const caps = detectCapabilities();
    trackEvent("enhance_start", {
      scale,
      engine,
      accel: caps.accel,
      tier: caps.tier,
      warm: engine === "neural" ? neuralWarmRef.current : true,
      src_w: dims?.w ?? 0,
      src_h: dims?.h ?? 0,
      src_pixels: dims ? dims.w * dims.h : 0,
      file_bytes: fileInfo?.bytes ?? 0,
      format: fileInfo?.type ?? "",
    });

    // Predict how long this will take on THIS device using the self-calibrating
    // prediction engine, then start a live countdown so the user knows the wait
    // up-front instead of staring at an open-ended spinner. The prediction folds
    // in the real dimensions, chosen quality/engine, device tier, warm state,
    // file size and the learned per-device correction factor.
    // Predict how long this will take on THIS device using the self-calibrating
    // prediction engine, then start a live countdown so the user knows the wait
    // up-front instead of staring at an open-ended spinner. The prediction folds
    // in the real dimensions, chosen quality/engine, device tier, warm state,
    // file size and the learned per-device correction factor.
    const prediction = dims
      ? predict({
          srcW: dims.w,
          srcH: dims.h,
          scale,
          engine,
          tier: caps.tier,
          warm: engine === "neural" ? neuralWarmRef.current : true,
          fileBytes: fileInfo?.bytes,
          format: fileInfo?.type,
        })
      : null;
    const estimatedMs = prediction?.estimateMs ?? 8000;
    runBaseMsRef.current = prediction?.baseMs ?? estimatedMs;
    setRunAccuracy(prediction ? confidencePercent(prediction.confidence) : 97);
    const startedAt = Date.now();
    setEtaTotalMs(estimatedMs);
    setEtaRemainingMs(estimatedMs);
    stopCountdown();
    // Dynamically adjust the ETA from real progress so it never expires early:
    // if the run is behind schedule the clock extends rather than hitting zero.
    countdownRef.current = setInterval(() => {
      const remaining = adjustRemainingMs({
        estimateMs: estimatedMs,
        elapsedMs: Date.now() - startedAt,
        progress: progressRef.current / 100,
      });
      setEtaRemainingMs(remaining);
    }, 250);
    try {
      // Lazy-load the local engine (and its worker) on first use so it never
      // bloats the initial page load. All inference runs on the user's own
      // device — no server, no API, no credits.
      const { enhanceImageInBrowser } = await import("@/lib/enhance/pipeline");
      const res = await enhanceImageInBrowser(original, {
        scale,
        engine,
        tier: isPremium ? "premium" : "free",
        signal: controller.signal,
        onProgress: (p) => {
          const pct = Math.round(p.value * 100);
          setProgress(pct);
          progressRef.current = pct;
          setProcStage(stageForProgress(p.value));
          setStatusMessage(p.message);
        },
      });
      clearResultUrl();
      resultUrlRef.current = res.image;
      setProgress(100);
      progressRef.current = 100;
      setProcStage("finalizing");
      setResult(res.image);
      setZoom(false);
      setResultInfo({
        width: res.width,
        height: res.height,
        durationMs: res.durationMs,
        path: res.path,
      });
      setStage("done");
      // Feed the real duration back into the per-device predictor so the next
      // estimate on this device is more accurate. Purely local (localStorage).
      recordOutcome({ engine, baseMs: runBaseMsRef.current, actualMs: res.durationMs });
      setCalibrationVersion((v) => v + 1);
      toast.success(`Enhanced to ${scale.toUpperCase()} quality!`);
      trackEvent("enhance_complete", {
        scale,
        engine,
        path: res.path,
        accel: res.capabilities.accel,
        tier: res.capabilities.tier,
        durationMs: res.durationMs,
        out_w: res.width,
        out_h: res.height,
        out_pixels: res.width * res.height,
        src_w: dims?.w ?? 0,
        src_h: dims?.h ?? 0,
        src_pixels: dims ? dims.w * dims.h : 0,
        file_bytes: fileInfo?.bytes ?? 0,
        format: fileInfo?.type ?? "",
      });
    } catch (err) {
      // A user-initiated cancel is not an error — reset() already handled UI.
      if (err instanceof DOMException && err.name === "AbortError") {
        trackEvent("enhance_fail", {
          scale,
          engine,
          error_code: "aborted",
          durationMs: Date.now() - startedAt,
          progress: progressRef.current,
        });
        return;
      }
      const errorCode =
        err instanceof Error && err.name === "UnsupportedBrowserError"
          ? "unsupported_browser"
          : err instanceof Error && err.name
            ? err.name
            : "unknown";
      if (errorCode === "unsupported_browser") {
        toast.error("Your browser does not support this enhancement mode. Try a modern browser.");
      } else {
        toast.error("Enhancement failed. Please try a different image.");
      }
      trackEvent("enhance_fail", {
        scale,
        engine,
        accel: caps.accel,
        tier: caps.tier,
        error_code: errorCode,
        durationMs: Date.now() - startedAt,
        progress: progressRef.current,
        src_w: dims?.w ?? 0,
        src_h: dims?.h ?? 0,
        src_pixels: dims ? dims.w * dims.h : 0,
        file_bytes: fileInfo?.bytes ?? 0,
        format: fileInfo?.type ?? "",
      });
      setStage("ready");
    } finally {
      stopCountdown();
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [
    clearResultUrl,
    original,
    scale,
    engine,
    fileInfo,
    stopCountdown,
    isPremium,
    isSignedIn,
    consumeFn,
    entitlementQuery,
    openUpgradeWall,
  ]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopCountdown();
    clearResultUrl();
    setOriginal(null);
    setResult(null);
    setResultInfo(null);
    setZoom(false);
    setStage("idle");
    setProgress(0);
    progressRef.current = 0;
    setProcStage("preparing");
    setEtaTotalMs(0);
    setEtaRemainingMs(0);
    dimensionsRef.current = null;
    setDims(null);
    setFileInfo(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [clearResultUrl, stopCountdown]);

  // Pre-run prediction shown in the AI Analysis Card. Recomputed when inputs or
  // the learned calibration change. SSR-safe: predict() guards localStorage.
  const prediction = useMemo(() => {
    if (!dims) return null;
    return predict({
      srcW: dims.w,
      srcH: dims.h,
      scale,
      engine,
      tier: deviceTier,
      warm: engine === "neural" ? neuralWarm : true,
      fileBytes: fileInfo?.bytes,
      format: fileInfo?.type,
    });
    // calibrationVersion is an intentional recompute trigger after each run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, scale, engine, deviceTier, neuralWarm, fileInfo, calibrationVersion]);

  const download = useCallback(() => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `pixel-perfect-pro-${scale}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    trackEvent("download", {
      ok: true,
      scale,
      engine,
      path: resultInfo?.path ?? "",
      out_w: resultInfo?.width ?? 0,
      out_h: resultInfo?.height ?? 0,
      out_pixels: resultInfo ? resultInfo.width * resultInfo.height : 0,
      durationMs: resultInfo?.durationMs ?? 0,
    });
  }, [result, scale, engine, resultInfo]);

  return (
    <div className="min-h-dvh bg-hero">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to upload
      </a>

      {/* Ambient — twin drifting electric-blue blooms behind the hero, forming
          a slow, cinematic aurora that reacts subtly to page life. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[85vh] overflow-hidden"
        aria-hidden="true"
      >
        <div className="animate-aurora-drift absolute left-1/2 top-[-18%] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[150px]" />
        <div
          className="animate-aurora-drift absolute right-[-10%] top-[15%] h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-[120px]"
          style={{ animationDelay: "-6s", animationDuration: "22s" }}
        />
        <div
          className="animate-aurora-drift absolute left-[-8%] top-[35%] h-[24rem] w-[24rem] rounded-full bg-primary/10 blur-[130px]"
          style={{ animationDelay: "-12s", animationDuration: "26s" }}
        />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col px-5 pt-6 sm:px-8">
        {/* Floating brand pill — Apple Noir */}
        <header className="animate-fade-up fixed left-1/2 top-6 z-50 w-[calc(100%-2.5rem)] max-w-2xl -translate-x-1/2">
          <div className="flex items-center justify-between rounded-full border border-white/10 bg-[oklch(0.09_0_0/0.72)] px-5 py-2.5 shadow-cinema backdrop-blur-xl transition-shadow duration-500 hover:shadow-glow">
            <Link to="/" className="flex items-center gap-2 group" aria-label={`${SITE.name} home`}>
              <span className="relative flex h-6 w-6 items-center justify-center rounded-md bg-primary transition-transform duration-500 group-hover:rotate-[8deg] group-hover:scale-110">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />
                <span className="absolute inset-0 rounded-md bg-primary opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-70" />
              </span>
              <span className="font-display text-lg tracking-tight text-foreground">
                {SITE.name}
              </span>
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2">
              <a
                href="#workspace"
                className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                Enhance
              </a>
              <a
                href="#how-heading"
                className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                How it works
              </a>
              <Link
                to="/pricing"
                className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                Pricing
              </Link>
              <Link
                to="/contact"
                className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                Contact
              </Link>
              <a
                href="#workspace"
                className="sheen inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_20px_-2px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
              >
                Launch App
              </a>
            </nav>
          </div>
        </header>

        <main>
          {/* Hero — cinematic serif with staggered blur-in entrance */}
          <section className="relative pt-40 pb-20 text-center sm:pt-48">
            <div className="stagger-in">
              <div
                className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Neural Core v2.4 Loaded
              </div>
              <h1
                className="mx-auto max-w-5xl font-display text-[4rem] font-bold leading-[0.9] tracking-[-0.04em] text-white sm:text-7xl md:text-[8rem]"
              >
                Precision
                <br />
                <span className="text-shimmer italic">Enhancement</span>
              </h1>
              <p
                className="mx-auto mt-10 max-w-2xl text-lg font-medium leading-relaxed text-muted-foreground/80 sm:text-xl lg:text-2xl"
              >
                The world's most advanced browser-first AI upscaler. <br className="hidden lg:block" />
                8K precision, zero latency, absolute privacy.
              </p>

            </div>
            <div
              className="animate-hero-in mt-10 flex flex-col items-center gap-4"
              style={{ animationDelay: "0.5s" }}
            >
              <a
                href="#workspace"
                className="sheen group relative inline-flex items-center justify-center gap-2 rounded-full bg-primary px-9 py-4 text-base font-semibold text-primary-foreground shadow-[0_0_40px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_60px_-8px_color-mix(in_oklab,var(--primary)_80%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Start enhancing free
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </a>
            </div>

            <HeroVisual />

            <div
              className="animate-hero-in mt-16 flex items-center justify-center gap-12 border-t border-white/5 pt-12"
              style={{ animationDelay: "0.8s" }}
            >

                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </a>
            </div>
            <div
              className="animate-hero-in mx-auto mt-14 flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70"
              style={{ animationDelay: "0.7s" }}
            >
              <span>100% on-device</span>
              <span aria-hidden="true">·</span>
              <span>Zero uploads</span>
              <span aria-hidden="true">·</span>
              <span>No watermark</span>
              <span aria-hidden="true">·</span>
              <span>4K &amp; 8K output</span>
            </div>
          </section>

          <HeroVisual />

          <HomeTopSections />

          {/* Workspace */}
          <section
            id="workspace"
            aria-label="Image enhancer"
            className="animate-fade-up relative mt-4 sm:mt-8"
            style={{ animationDelay: "0.1s" }}
          >
            {stage === "idle" && (
              <div className="relative mx-auto max-w-4xl">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-primary/20 via-transparent to-primary/10 opacity-30 blur-xl"
                />
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) loadFile(f);
                  }}
                  className={`relative flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-[oklch(0.04_0_0)] px-6 py-20 text-center transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring sm:py-28 ${
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-white/10 hover:border-primary/50"
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT_ATTR}
                    className="sr-only"
                    aria-label="Upload an image to enhance"
                    data-hydrated={hydrated ? "true" : undefined}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) loadFile(f);
                    }}
                  />
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[oklch(0.09_0_0)]">
                    <UploadCloud className="h-7 w-7 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="mt-6 font-display text-3xl text-foreground sm:text-4xl">
                    Drop your image here
                  </h3>
                  <p className="mt-2 text-sm font-light text-muted-foreground">
                    Supports JPG, PNG and WEBP — up to 15MB
                  </p>
                </label>
              </div>
            )}

            {stage !== "idle" && original && (
              <div className="mx-auto flex max-w-4xl flex-col gap-6 rounded-3xl border border-white/10 bg-[oklch(0.04_0_0)] p-4 shadow-cinema sm:p-6">
                <div className="relative">
                  {stage === "done" && result ? (
                    <div className="space-y-3">
                      {zoom ? (
                        <div className="relative max-h-[70vh] overflow-auto rounded-2xl border border-border bg-muted/20">
                          <img
                            src={result}
                            alt={`Enhanced ${scale.toUpperCase()} result at actual pixels`}
                            className="block max-w-none"
                            style={{
                              width: resultInfo ? `${resultInfo.width}px` : "auto",
                            }}
                            draggable={false}
                            decoding="async"
                          />
                          <span className="pointer-events-none sticky left-3 top-3 float-left rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                            Actual pixels · scroll to explore
                          </span>
                        </div>
                      ) : (
                        <CompareSlider
                          before={original}
                          after={result}
                          afterAlt={`Enhanced ${scale.toUpperCase()} result`}
                        />
                      )}
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setZoom((z) => !z)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-pressed={zoom}
                        >
                          {zoom ? "Fit to screen" : "View actual pixels (100%)"}
                        </button>
                      </div>
                      {resultInfo && (
                        <p className="text-center text-sm text-muted-foreground" aria-live="polite">
                          Output verified: {resultInfo.width.toLocaleString()}×
                          {resultInfo.height.toLocaleString()} PNG ·{" "}
                          {resultInfo.path === "neural"
                            ? "on-device neural engine"
                            : `on-device ${resultInfo.path} engine`}{" "}
                          · {(resultInfo.durationMs / 1000).toFixed(1)}s
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/20">
                      <img
                        src={original}
                        alt="Your uploaded image preview"
                        className="block max-h-[70vh] w-full object-contain"
                      />

                      {stage === "loading" && (
                        <ProcessingOverlay
                          scale={scale}
                          progress={progress}
                          statusMessage={statusMessage}
                          etaRemainingMs={etaRemainingMs}
                          stage={procStage}
                          accuracy={runAccuracy}
                          onCancel={reset}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-4">
                  {stage !== "done" && (
                    <fieldset
                      className="grid grid-cols-2 gap-3 border-0 p-0"
                      disabled={stage === "loading"}
                    >
                      <legend className="sr-only">Choose output resolution</legend>
                      {(["4k", "8k"] as Scale[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={scale === s}
                          onClick={() => setScale(s)}
                          className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                            scale === s
                              ? "border-primary bg-primary/10 shadow-glow"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <span className="flex items-center gap-2 font-display font-bold">
                            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
                            {s.toUpperCase()} Quality
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {s === "4k" ? "Sharp & fast" : "Maximum detail"}
                          </span>
                        </button>
                      ))}
                    </fieldset>
                  )}

                  {stage !== "done" && (
                    <fieldset
                      className="grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2"
                      disabled={stage === "loading"}
                    >
                      <legend className="sr-only">Choose enhancement engine</legend>
                      {(
                        [
                          {
                            id: "classical" as const,
                            title: "Fast",
                            desc: "Instant · on-device · free",
                            icon: "zap" as const,
                            show: true,
                          },
                          {
                            id: "neural" as const,
                            title: "Balanced (AI)",
                            desc: "On-device Real-ESRGAN · WebGPU · free · 2.4MB one-time",
                            icon: "spark" as const,
                            show: neuralAvailable,
                          },
                        ] as const
                      )
                        .filter((e) => e.show)
                        .map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            aria-pressed={engine === e.id}
                            onClick={() => setEngine(e.id)}
                            className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                              engine === e.id
                                ? "border-primary bg-primary/10 shadow-glow"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <span className="flex items-center gap-2 font-display font-bold">
                              {e.icon === "spark" ? (
                                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                              ) : (
                                <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
                              )}
                              {e.title}
                            </span>
                            <span className="text-xs text-muted-foreground">{e.desc}</span>
                          </button>
                        ))}
                    </fieldset>
                  )}

                  {stage === "ready" && dims && prediction && (
                    <AnalysisCard
                      prediction={prediction}
                      width={dims.w}
                      height={dims.h}
                      format={fileInfo?.type ?? null}
                      engine={engine}
                      scale={scale}
                      tier={deviceTier}
                      accelLabel={accelLabel}
                      neuralAvailable={neuralAvailable}
                      neuralWarm={neuralWarm}
                    />
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    {stage !== "done" ? (
                      <Button
                        variant="hero"
                        size="xl"
                        className="flex-1"
                        disabled={stage === "loading"}
                        onClick={enhance}
                      >
                        <Wand2 className="h-5 w-5" aria-hidden="true" />
                        {stage === "loading" ? "Enhancing…" : `Enhance to ${scale.toUpperCase()}`}
                      </Button>
                    ) : (
                      <Button variant="hero" size="xl" className="flex-1" onClick={download}>
                        <Download className="h-5 w-5" aria-hidden="true" />
                        Download {scale.toUpperCase()} Image
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="xl"
                      disabled={stage === "loading"}
                      onClick={reset}
                    >
                      <RotateCcw className="h-5 w-5" aria-hidden="true" />
                      New Image
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
          <HomeContent />
          <BeforeAfterGallery />
        </main>
      </div>

      <SiteFooter />

      <UpgradeWall
        open={wallOpen}
        onClose={() => setWallOpen(false)}
        used={usedCount}
        cap={FREE_CAP}
        isSignedIn={isSignedIn}
        onUpgrade={handleUpgrade}
        pending={wallPending}
        billingAvailable={billingAvailable}
      />
      {!isPremium && stage !== "idle" && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur">
          {remaining} of {FREE_CAP} free enhancements left ·{" "}
          <Link to="/pricing" className="pointer-events-auto underline hover:text-white">
            Upgrade
          </Link>
        </div>
      )}
    </div>
  );
}
