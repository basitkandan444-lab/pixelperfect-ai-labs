import { UploadCloud, Wand2, Download } from "lucide-react";

import { FAQS } from "@/lib/site";

const STEPS = [
  {
    icon: UploadCloud,
    title: "1. Upload your image",
    desc: "Drag and drop a JPG, PNG or WEBP file, or tap to browse. Your photo loads instantly in the browser — no account or setup needed.",
  },
  {
    icon: Wand2,
    title: "2. Let the AI enhance it",
    desc: "Choose 4K or 8K, then the AI sharpens blur, removes noise and reconstructs fine detail while keeping your original subject and composition intact.",
  },
  {
    icon: Download,
    title: "3. Download the result",
    desc: "Compare the before and after with the slider, then download your high-resolution enhanced image with a single tap.",
  },
];

const BENEFITS = [
  {
    title: "Completely free",
    desc: "Enhance and upscale as many photos as you like without a subscription, trial or hidden cost.",
  },
  {
    title: "Fast results",
    desc: "AI processing typically finishes in seconds, with a live before / after comparison to review the difference.",
  },
  {
    title: "Nothing to install",
    desc: "Everything runs in your web browser. There are no apps, plugins or downloads to manage.",
  },
  {
    title: "Works everywhere",
    desc: "Use it on your phone, tablet or computer — the interface adapts to any screen size.",
  },
  {
    title: "AI-powered detail",
    desc: "A super-resolution model rebuilds realistic textures and edges instead of simply stretching pixels.",
  },
  {
    title: "Simple by design",
    desc: "Upload, enhance and download in three steps, with clear controls and no technical knowledge required.",
  },
];

const FORMATS = [
  { name: "JPG / JPEG", desc: "Ideal for photographs and everyday camera images." },
  { name: "PNG", desc: "Best for graphics, screenshots and images with transparency." },
  { name: "WEBP", desc: "A modern, efficient format used widely across the web." },
];

export function HomeContent() {
  return (
    <>
      {/* How it works */}
      <section className="mt-24" aria-labelledby="how-heading">
        <div className="text-center">
          <h2 id="how-heading" className="font-display text-2xl font-bold sm:text-3xl">
            How Pixel Perfect Pro works
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Turning a low-quality photo into a sharp, high-resolution image takes just three
            simple steps — all from your browser.
          </p>
        </div>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title} className="rounded-2xl glass p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                <s.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why use */}
      <section className="mt-24" aria-labelledby="why-heading">
        <div className="text-center">
          <h2 id="why-heading" className="font-display text-2xl font-bold sm:text-3xl">
            Why use Pixel Perfect Pro
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            A practical, browser-based tool for anyone who needs clearer, higher-resolution
            images without specialised software.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl glass p-5">
              <h3 className="font-display text-base font-semibold">{b.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported formats */}
      <section className="mt-24" aria-labelledby="formats-heading">
        <div className="text-center">
          <h2 id="formats-heading" className="font-display text-2xl font-bold sm:text-3xl">
            Supported formats
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            You can upload the most common image types, up to a maximum file size of 15MB per
            image.
          </p>
        </div>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
          {FORMATS.map((f) => (
            <div key={f.name} className="rounded-2xl glass p-5 text-center">
              <p className="font-display text-lg font-bold text-gradient">{f.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy & security */}
      <section className="mt-24" aria-labelledby="privacy-heading">
        <div className="mx-auto max-w-3xl rounded-3xl glass p-6 sm:p-10">
          <h2 id="privacy-heading" className="font-display text-2xl font-bold sm:text-3xl">
            Privacy &amp; security
          </h2>
          <div className="mt-4 flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Your image is uploaded only to generate the enhanced version. It is processed for
              that single request and is not stored permanently, published, shared or sold.
            </p>
            <p>
              You do not need an account, so no personal profile is created and no login details
              are required to use the enhancer.
            </p>
            <p>
              You retain full ownership of everything you upload and everything you download. For
              full details, read our{" "}
              <a
                href="/privacy"
                className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-24" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-center font-display text-2xl font-bold sm:text-3xl">
          Frequently asked questions
        </h2>
        <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-2xl glass p-5 [&_summary]:cursor-pointer">
              <summary className="flex items-center justify-between gap-4 font-display text-base font-semibold marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {f.q}
                <span
                  className="text-primary transition-transform group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
