import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  UploadCloud,
  Wand2,
  Download,
  RotateCcw,
  Zap,
  Gauge,
} from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CompareSlider } from "@/components/CompareSlider";
import { SiteFooter } from "@/components/SiteFooter";
import { HomeContent } from "@/components/HomeContent";
import { BeforeAfterGallery } from "@/components/BeforeAfterGallery";
import { AnalysisCard } from "@/components/AnalysisCard";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { trackEvent } from "@/lib/analytics";
import { SITE, FAQS, absoluteUrl } from "@/lib/site";
import { originLoader } from "@/lib/origin.functions";
import { detectCapabilities } from "@/lib/enhance/capabilities";

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
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large. Maximum size is 15MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error("Could not read that file. Please try another image.");
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setOriginal(dataUrl);
      clearResultUrl();
      setResult(null);
      setResultInfo(null);
      setStage("ready");
      setFileInfo({ bytes: file.size, type: file.type || "" });
      toast.success("Image ready. Choose a quality and enhance it.");
      trackEvent("upload", { format: file.type, size: file.size });


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

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(4);
    progressRef.current = 4;
    setProcStage("preparing");
    setStatusMessage("Preparing local AI engine…");
    setStage("loading");
    trackEvent("enhance_start", { scale, engine });

    // Predict how long this will take on THIS device using the self-calibrating
    // prediction engine, then start a live countdown so the user knows the wait
    // up-front instead of staring at an open-ended spinner. The prediction folds
    // in the real dimensions, chosen quality/engine, device tier, warm state,
    // file size and the learned per-device correction factor.
    const dims = dimensionsRef.current;
    const caps = detectCapabilities();
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
        engine: res.path,
        accel: res.capabilities.accel,
        durationMs: res.durationMs,
      });
    } catch (err) {
      // A user-initiated cancel is not an error — reset() already handled UI.
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof Error && err.name === "UnsupportedBrowserError") {
        toast.error("Your browser does not support this enhancement mode. Try a modern browser.");
      } else {
        toast.error("Enhancement failed. Please try a different image.");
      }
      setStage("ready");
    } finally {
      stopCountdown();
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [clearResultUrl, original, scale, engine, fileInfo, stopCountdown]);


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
    trackEvent("download", { scale });
  }, [result, scale]);

  return (
    <div className="min-h-dvh bg-hero">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to upload
      </a>

      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="animate-glow-pulse absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="animate-float absolute top-1/3 -right-20 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-5xl flex-col px-5 pt-8 sm:px-8">
        {/* Nav */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">{SITE.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/contact"
              className="rounded-full px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Contact
            </Link>
            <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground sm:flex">
              <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Free · Powered by AI
            </span>
          </div>
        </header>

        <main>
          {/* Hero */}
          <section className="animate-fade-up mt-14 text-center sm:mt-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-border glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
              <span
                className="h-2 w-2 animate-glow-pulse rounded-full bg-primary"
                aria-hidden="true"
              />
              Free AI Image Enhancer
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
              Turn blurry photos into
              <span className="text-gradient"> stunning 4K &amp; 8K</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Upload any low-quality image and let our AI photo enhancer sharpen blur, remove noise
              and upscale it to razor-sharp 4K or 8K resolution in seconds — completely free.
            </p>
          </section>

          {/* Workspace */}
          <section
            id="workspace"
            aria-label="Image enhancer"
            className="animate-fade-up mt-12 rounded-3xl glass p-4 shadow-elegant sm:p-6"
            style={{ animationDelay: "0.1s" }}
          >
            {stage === "idle" && (
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
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring sm:py-24 ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
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
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
                  <UploadCloud className="h-8 w-8 text-primary-foreground" aria-hidden="true" />
                </div>
                <p className="mt-5 font-display text-lg font-semibold">
                  Drop your image here, or tap to upload
                </p>
                <p className="mt-1 text-sm text-muted-foreground">JPG, PNG or WEBP — up to 15MB</p>
              </label>
            )}

            {stage !== "idle" && original && (
              <div className="flex flex-col gap-6">
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
    </div>
  );
}
