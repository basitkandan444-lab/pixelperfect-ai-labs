import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { trackEvent } from "@/lib/analytics";
import { SITE, FAQS, absoluteUrl } from "@/lib/site";
import { getRequestOrigin } from "@/lib/origin.functions";

export const Route = createFileRoute("/")({
  component: Index,
  loader: async () => ({ origin: await getRequestOrigin() }),
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
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.9",
              ratingCount: "1280",
            },
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
type Stage = "idle" | "ready" | "loading" | "done";

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

function Index() {
  const [stage, setStage] = useState<Stage>("idle");
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale>("4k");
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Simulated progress while the AI works (the API returns a single result).
  useEffect(() => {
    if (stage !== "loading") return;
    setProgress(8);
    const id = setInterval(() => {
      setProgress((p) => (p < 92 ? p + Math.max(1, (95 - p) * 0.06) : p));
    }, 400);
    return () => clearInterval(id);
  }, [stage]);

  const loadFile = useCallback((file: File) => {
    if (!ACCEPTED.includes(file.type)) {
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
      setOriginal(reader.result as string);
      setResult(null);
      setStage("ready");
      toast.success("Image ready. Choose a quality and enhance it.");
      trackEvent("upload", { format: file.type, size: file.size });
    };
    reader.readAsDataURL(file);
  }, []);

  const enhance = useCallback(async () => {
    if (!original) return;
    setStage("loading");
    trackEvent("enhance_start", { scale });
    try {
      const res = await fetch("/api/enhance-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: original, scale }),
      });
      const data = (await res.json()) as { image?: string; error?: string };
      if (!res.ok || !data.image) {
        toast.error(data.error ?? "Enhancement failed. Please try again.");
        setStage("ready");
        return;
      }
      setProgress(100);
      setResult(data.image);
      setStage("done");
      toast.success(`Enhanced to ${scale.toUpperCase()} quality!`);
      trackEvent("enhance_complete", { scale });
    } catch {
      toast.error("Network error. Please check your connection and try again.");
      setStage("ready");
    }
  }, [original, scale]);

  const reset = useCallback(() => {
    setOriginal(null);
    setResult(null);
    setStage("idle");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

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
    <div className="min-h-screen bg-hero">
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
              <span className="h-2 w-2 animate-glow-pulse rounded-full bg-primary" aria-hidden="true" />
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
                <p className="mt-1 text-sm text-muted-foreground">
                  JPG, PNG or WEBP — up to 15MB
                </p>
              </label>
            )}

            {stage !== "idle" && original && (
              <div className="flex flex-col gap-6">
                <div className="relative">
                  {stage === "done" && result ? (
                    <CompareSlider
                      before={original}
                      after={result}
                      afterAlt={`Enhanced ${scale.toUpperCase()} result`}
                    />

                  ) : (
                    <div className="relative overflow-hidden rounded-2xl border border-border">
                      <img src={original} alt="Your uploaded image preview" className="block w-full" />
                      {stage === "loading" && (
                        <div
                          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 px-6 backdrop-blur-sm"
                          role="status"
                          aria-live="polite"
                        >
                          <div className="shimmer absolute inset-0 h-full w-full" aria-hidden="true" />
                          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
                            <Wand2 className="h-7 w-7 animate-pulse text-primary-foreground" aria-hidden="true" />
                          </div>
                          <p className="relative font-display font-semibold">
                            Enhancing to {scale.toUpperCase()}…
                          </p>
                          <div
                            className="relative h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuenow={Math.round(progress)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Enhancement progress"
                          >
                            <div
                              className="h-full bg-gradient-primary transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="relative text-sm text-muted-foreground">
                            Reconstructing fine detail with AI
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-4">
                  {stage !== "done" && (
                    <fieldset className="grid grid-cols-2 gap-3 border-0 p-0" disabled={stage === "loading"}>
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
