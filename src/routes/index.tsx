import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import {
  Sparkles,
  UploadCloud,
  Wand2,
  Download,
  RotateCcw,
  Zap,
  ImageIcon,
  ShieldCheck,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CompareSlider } from "@/components/CompareSlider";

export const Route = createFileRoute("/")({
  component: Index,
});

type Scale = "4k" | "8k";
type Stage = "idle" | "ready" | "loading" | "done";

const MAX_BYTES = 15 * 1024 * 1024;

function Index() {
  const [stage, setStage] = useState<Stage>("idle");
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale>("4k");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large. Max 15MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setOriginal(reader.result as string);
      setResult(null);
      setStage("ready");
    };
    reader.readAsDataURL(file);
  }, []);

  const enhance = useCallback(async () => {
    if (!original) return;
    setStage("loading");
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
      setResult(data.image);
      setStage("done");
      toast.success(`Enhanced to ${scale.toUpperCase()} quality!`);
    } catch {
      toast.error("Network error. Please try again.");
      setStage("ready");
    }
  }, [original, scale]);

  const reset = useCallback(() => {
    setOriginal(null);
    setResult(null);
    setStage("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const download = useCallback(() => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `enhanced-${scale}.png`;
    a.click();
  }, [result, scale]);

  return (
    <div className="min-h-screen bg-hero">
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-glow-pulse absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="animate-float absolute top-1/3 -right-20 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-5xl flex-col px-5 pb-24 pt-8 sm:px-8">
        {/* Nav */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">Upscayl AI</span>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground sm:flex">
            <Zap className="h-3.5 w-3.5 text-primary" /> Powered by AI
          </span>
        </header>

        {/* Hero */}
        <section className="animate-fade-up mt-14 text-center sm:mt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-border glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 animate-glow-pulse rounded-full bg-primary" />
            AI Super-Resolution Engine
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            Turn blurry photos into
            <span className="text-gradient"> stunning 4K &amp; 8K</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Upload any low-quality image and let AI restore razor-sharp detail,
            crisp textures and vivid clarity in seconds.
          </p>
        </section>

        {/* Workspace */}
        <section className="animate-fade-up mt-12 rounded-3xl glass p-4 shadow-elegant sm:p-6" style={{ animationDelay: "0.1s" }}>
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
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors sm:py-24 ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                }}
              />
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
                <UploadCloud className="h-8 w-8 text-primary-foreground" />
              </div>
              <p className="mt-5 font-display text-lg font-semibold">
                Drop your image here
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or click to browse — JPG, PNG, WEBP up to 15MB
              </p>
            </label>
          )}

          {stage !== "idle" && original && (
            <div className="flex flex-col gap-6">
              <div className="relative">
                {stage === "done" && result ? (
                  <CompareSlider before={original} after={result} />
                ) : (
                  <div className="relative overflow-hidden rounded-2xl border border-border">
                    <img src={original} alt="Uploaded preview" className="block w-full" />
                    {stage === "loading" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
                        <div className="shimmer h-full w-full absolute inset-0" />
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
                          <Wand2 className="h-7 w-7 animate-pulse text-primary-foreground" />
                        </div>
                        <p className="relative font-display font-semibold">
                          Enhancing to {scale.toUpperCase()}…
                        </p>
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
                  <div className="grid grid-cols-2 gap-3">
                    {(["4k", "8k"] as Scale[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={stage === "loading"}
                        onClick={() => setScale(s)}
                        className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all disabled:opacity-60 ${
                          scale === s
                            ? "border-primary bg-primary/10 shadow-glow"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <span className="flex items-center gap-2 font-display font-bold">
                          <Gauge className="h-4 w-4 text-primary" />
                          {s.toUpperCase()} Quality
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s === "4k" ? "Sharp & fast" : "Maximum detail"}
                        </span>
                      </button>
                    ))}
                  </div>
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
                      <Wand2 className="h-5 w-5" />
                      {stage === "loading" ? "Enhancing…" : `Enhance to ${scale.toUpperCase()}`}
                    </Button>
                  ) : (
                    <Button variant="hero" size="xl" className="flex-1" onClick={download}>
                      <Download className="h-5 w-5" />
                      Download {scale.toUpperCase()} Image
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="xl"
                    disabled={stage === "loading"}
                    onClick={reset}
                  >
                    <RotateCcw className="h-5 w-5" />
                    New Image
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Features */}
        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: ImageIcon,
              title: "Up to 8K Resolution",
              desc: "Rebuild crisp detail and lifelike textures from tiny inputs.",
            },
            {
              icon: Zap,
              title: "Ready in Seconds",
              desc: "Fast AI processing with a live before / after comparison.",
            },
            {
              icon: ShieldCheck,
              title: "True to the Original",
              desc: "Enhances quality without altering your photo's content.",
            },
          ].map((f, i) => (
            <div
              key={f.title}
              className="animate-fade-up rounded-2xl glass p-5"
              style={{ animationDelay: `${0.15 + i * 0.08}s` }}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        <footer className="mt-16 text-center text-sm text-muted-foreground">
          Upscayl AI — AI-powered image enhancement
        </footer>
      </div>
    </div>
  );
}
