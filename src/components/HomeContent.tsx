import { Link } from "@tanstack/react-router";
import {
  UploadCloud,
  ScanSearch,
  Wand2,
  Download,
  User,
  Mountain,
  Building2,
  Image as ImageIcon,
  Package,
  FileText,
  MoonStar,
  ShieldCheck,
} from "lucide-react";

import { FAQS } from "@/lib/site";

const STEPS = [
  {
    icon: UploadCloud,
    title: "1. Upload your image",
    desc: "Drag and drop a JPG, PNG or WEBP file, or tap to browse. The photo loads directly in your browser, so there is no account, install or setup before you start.",
  },
  {
    icon: ScanSearch,
    title: "2. The AI analyses it",
    desc: "The model examines your photo to locate soft edges, compression blocks, colour noise and lost texture — building an understanding of what the image should look like when it is clear.",
  },
  {
    icon: Wand2,
    title: "3. Detail is rebuilt",
    desc: "Using patterns learned from millions of images, the AI reconstructs sharper edges and finer texture and upscales to 4K or 8K, while keeping your original subject and composition intact.",
  },
  {
    icon: Download,
    title: "4. Compare and download",
    desc: "Move the before-and-after slider to see exactly what changed, then download the full-resolution result with a single tap — no watermark added.",
  },
];

const BENEFITS = [
  {
    title: "Blurry photos become usable again",
    problem:
      "A slightly out-of-focus or shaky shot is often the only copy of a moment you can't recreate.",
    outcome:
      "The AI sharpens soft edges and rebuilds texture, so a photo you were about to delete becomes clear enough to keep, print or post.",
  },
  {
    title: "Small images stop looking pixelated",
    problem: "Low-resolution images turn into a blocky mess the moment you enlarge or crop them.",
    outcome:
      "Super-resolution reconstructs detail as it upscales to 4K or 8K, so the enlarged image stays smooth instead of jagged.",
  },
  {
    title: "Compression artefacts disappear",
    problem:
      "Photos saved or re-shared through chat apps and social media pick up blocky, smeared JPEG artefacts.",
    outcome:
      "The model removes those artefacts and recovers cleaner tones, giving you a version that looks closer to the original capture.",
  },
  {
    title: "No software to learn",
    problem:
      "Traditional editors have steep learning curves and paid licences just to sharpen one photo.",
    outcome:
      "Three clear steps — upload, enhance, download — get you a finished result without any technical knowledge.",
  },
  {
    title: "Works on the device you already have",
    problem: "Powerful editing tools often demand a desktop and a strong graphics card.",
    outcome:
      "Everything runs in the browser and the heavy processing happens server-side, so a phone or an older laptop is enough.",
  },
  {
    title: "Free, with nothing to sign up for",
    problem: "Most enhancers hide the real result behind a watermark, trial limit or subscription.",
    outcome:
      "You can enhance as many images as you like and download them in full quality without paying or creating an account.",
  },
];

const USE_CASES = [
  {
    icon: User,
    title: "Portraits",
    problem: "Soft focus or motion blur on a face.",
    result: "Clearer eyes, hair and skin texture.",
    note: "Works best on natural faces; always review fine facial detail, as the AI can subtly reinterpret it.",
  },
  {
    icon: Mountain,
    title: "Landscapes",
    problem: "Hazy horizons and mushy foliage.",
    result: "Crisper edges and richer fine texture.",
    note: "Great for scenery where large areas of detail benefit from reconstruction and upscaling.",
  },
  {
    icon: Building2,
    title: "Architecture",
    problem: "Blurred lines and soft brickwork.",
    result: "Straighter, sharper structural detail.",
    note: "Helps recover the repeating patterns and edges that define buildings.",
  },
  {
    icon: ImageIcon,
    title: "Old photographs",
    problem: "Grain, fading and scanner noise.",
    result: "Reduced grain and recovered detail.",
    note: "Ideal for reprinting family photos at a larger, cleaner size.",
  },
  {
    icon: Package,
    title: "Product images",
    problem: "Low-resolution catalogue or listing shots.",
    result: "Sharper edges and cleaner surfaces.",
    note: "Useful for making small source images presentable on a store page.",
  },
  {
    icon: FileText,
    title: "Documents & screenshots",
    problem: "Compressed, hard-to-read captures.",
    result: "Crisper lines and clearer shapes.",
    note: "Improves legibility, though very small text may still need the original source when accuracy is critical.",
  },
  {
    icon: MoonStar,
    title: "Low-light photos",
    problem: "Dark, noisy indoor or night shots.",
    result: "Less noise and more visible detail.",
    note: "Reduces colour noise while keeping the natural mood of the scene.",
  },
  {
    icon: ImageIcon,
    title: "Compressed social images",
    problem: "Artefacts from repeated re-sharing.",
    result: "Cleaner tones and smoother edges.",
    note: "Rebuilds a version closer to how the photo looked before platforms compressed it.",
  },
];

const SEARCH_INTENT = [
  {
    q: "How can I improve a blurry photo?",
    a: "Upload the photo and let the AI analyse where detail was lost. It sharpens soft edges and rebuilds texture rather than simply increasing contrast, which is why the result looks clearer instead of just harder. Sharp-but-small photos improve the most; images that are extremely blurred have less detail to recover.",
  },
  {
    q: "Can AI actually increase image resolution?",
    a: "Yes. Instead of stretching existing pixels — which only makes them larger and blockier — super-resolution predicts the finer detail that a higher-resolution version would contain and fills it in. That is how a small image can be upscaled to 4K or 8K while staying smooth.",
  },
  {
    q: "Can AI restore old family photographs?",
    a: "Often, yes. Scanned and aged prints usually suffer from grain, fading and softness, all of which the AI is good at reducing. It can recover detail and upscale the photo for reprinting. It cannot invent detail the original never captured, so heavily damaged areas may only partially recover.",
  },
  {
    q: "Can AI fix compressed social media images?",
    a: "Yes. Repeated uploading and re-sharing adds blocky JPEG artefacts. The model removes those artefacts and reconstructs cleaner edges and tones, producing a version much closer to the original than the compressed copy you have.",
  },
  {
    q: "Can AI sharpen screenshots and documents?",
    a: "It can make compressed screenshots and scanned documents crisper and easier to read. For very small or critical text, keep the original source as well, since the AI reconstructs plausible detail and may reinterpret tiny characters.",
  },
  {
    q: "Will increasing resolution improve every image?",
    a: "No tool improves every image equally. Photos with a reasonable amount of underlying detail improve the most. Images that are tiny, extremely compressed or badly damaged have less information to work with, so gains are more modest. Enhancement recovers and rebuilds detail — it does not guarantee a perfect result on every file.",
  },
];

const TRUST = [
  {
    title: "Your privacy",
    desc: "Images are sent securely to the AI only to create your enhanced result. They are not added to a public gallery, used for advertising or sold.",
  },
  {
    title: "How processing works",
    desc: "The heavy work runs server-side for a single request, then returns the result to your browser. Nothing is published on your behalf.",
  },
  {
    title: "You own your content",
    desc: "You keep full rights to every image you upload and every file you download. We claim no ownership over your photos.",
  },
  {
    title: "No account needed",
    desc: "There is no sign-up, login or email step, so no personal profile is created just to enhance a photo.",
  },
  {
    title: "Any modern device",
    desc: "It runs in the browser on phones, tablets and computers — there is nothing to install or update.",
  },
  {
    title: "Clear file limits",
    desc: "Upload JPG, PNG or WEBP files up to 15MB each. Most images finish in seconds; larger files and 8K output take a little longer.",
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
            Behind the single Enhance button, the AI moves through four stages. Here is what
            actually happens to your photo — in plain language, without the hype.
          </p>
        </div>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            Each of these solves a specific, everyday problem with photos — not vague promises about
            &ldquo;amazing&rdquo; results.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl glass p-5">
              <h3 className="font-display text-base font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground/80">The problem: </span>
                {b.problem}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground/80">The outcome: </span>
                {b.outcome}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases / before & after */}
      <section className="mt-24" aria-labelledby="usecases-heading">
        <div className="text-center">
          <h2 id="usecases-heading" className="font-display text-2xl font-bold sm:text-3xl">
            What it works well on
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Different photos have different problems. Below is what the AI typically does for each
            kind of image, and where to keep your expectations realistic.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((u) => (
            <div key={u.title} className="flex flex-col rounded-2xl glass p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <u.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold">{u.title}</h3>
              <dl className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                <div>
                  <dt className="inline font-medium text-foreground/80">Problem: </dt>
                  <dd className="inline">{u.problem}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/80">Result: </dt>
                  <dd className="inline">{u.result}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">{u.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Search intent Q&A */}
      <section className="mt-24" aria-labelledby="learn-heading">
        <div className="text-center">
          <h2 id="learn-heading" className="font-display text-2xl font-bold sm:text-3xl">
            Understanding AI image enhancement
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Honest answers to the questions people most often ask before enhancing a photo.
          </p>
        </div>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
          {SEARCH_INTENT.map((item) => (
            <article key={item.q} className="rounded-2xl glass p-5">
              <h3 className="font-display text-base font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </article>
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
            Upload the most common image types, up to a maximum file size of 15MB per image.
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

      {/* Trust */}
      <section className="mt-24" aria-labelledby="trust-heading">
        <div className="mx-auto max-w-4xl rounded-3xl glass p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <h2 id="trust-heading" className="font-display text-2xl font-bold sm:text-3xl">
              Privacy, ownership &amp; what to expect
            </h2>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Enhancing a personal photo should not cost you your privacy. Here is exactly how your
            images are handled and what the tool can realistically do.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((t) => (
              <div
                key={t.title}
                className="rounded-2xl border border-border/60 bg-background/30 p-4"
              >
                <h3 className="font-display text-sm font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            For the full detail, read our{" "}
            <Link
              to="/privacy"
              className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              to="/terms"
              className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-24" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-center font-display text-2xl font-bold sm:text-3xl">
          Frequently asked questions
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground sm:text-base">
          A quick knowledge base covering pricing, privacy, file limits and the AI&rsquo;s real
          strengths and limits.
        </p>
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

      {/* Explore / internal linking */}
      <section className="mt-24" aria-labelledby="explore-heading">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="explore-heading" className="font-display text-2xl font-bold sm:text-3xl">
            Explore Pixel Perfect Pro
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Learn more about the project, how your data is handled, or get in touch.
          </p>
          <nav aria-label="Explore" className="mt-6 flex flex-wrap justify-center gap-3">
            {[
              { to: "/about", label: "About the tool" },
              { to: "/privacy", label: "Privacy Policy" },
              { to: "/terms", label: "Terms of Service" },
              { to: "/cookies", label: "Cookie Policy" },
              { to: "/contact", label: "Contact us" },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-full border border-border glass px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </>
  );
}
