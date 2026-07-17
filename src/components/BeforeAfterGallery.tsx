import { CompareSlider } from "@/components/CompareSlider";

interface GalleryItem {
  slug: string;
  category: string;
  title: string;
  problem: string;
  enhancement: string;
  result: string;
}

const ITEMS: GalleryItem[] = [
  {
    slug: "landscape",
    category: "Landscape",
    title: "Mountain lake at golden hour",
    problem: "Soft, low-resolution scenery with washed-out colour and mushy detail.",
    enhancement:
      "AI reconstructs edges, recovers texture in rock and water, and rebalances colour.",
    result: "A crisp, vibrant landscape ready for prints and wallpapers.",
  },
  {
    slug: "oldphoto",
    category: "Old photo",
    title: "Restored vintage car",
    problem: "A faded, grainy archival shot with scanning noise and lost sharpness.",
    enhancement: "Grain is reduced, softened detail is rebuilt and the image is upscaled.",
    result: "A clean, sharp restoration suitable for reprinting or sharing.",
  },
  {
    slug: "product",
    category: "Product",
    title: "Luxury watch product shot",
    problem: "Blurry catalogue image where fine metal and dial detail is lost.",
    enhancement: "Micro-contrast and edges are restored so textures read clearly.",
    result: "A sharp, e-commerce-ready product photo that looks premium.",
  },
  {
    slug: "lowlight",
    category: "Low-light",
    title: "Rainy neon street at night",
    problem: "Noisy, muddy low-light photo with crushed shadows and colour smear.",
    enhancement: "Noise is cleaned while highlights, reflections and neon stay intact.",
    result: "A cinematic night scene with clean detail and rich colour.",
  },
  {
    slug: "macro",
    category: "Macro",
    title: "Butterfly on a dewy flower",
    problem: "Compressed close-up where fine wing patterns and dew droplets blur together.",
    enhancement: "Fine structures are sharpened and separated without over-processing.",
    result: "A tack-sharp macro that keeps natural texture and colour.",
  },
  {
    slug: "architecture",
    category: "Architecture",
    title: "Curved glass skyscraper",
    problem: "Low-quality upload with soft lines and JPEG artefacts across the facade.",
    enhancement: "Straight edges and repeating patterns are cleanly reconstructed.",
    result: "Sharp geometry and glass reflections with no visible artefacts.",
  },
];

export function BeforeAfterGallery() {
  return (
    <section aria-labelledby="gallery-heading" className="mt-20">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
          Real results
        </span>
        <h2
          id="gallery-heading"
          className="mx-auto mt-5 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Before &amp; after gallery
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
          Drag the slider on each example to see how our AI image enhancer sharpens detail, reduces
          noise and restores clarity across different types of photos.
        </p>
      </div>

      <ul className="mt-10 grid list-none grid-cols-1 gap-6 p-0 lg:grid-cols-2">
        {ITEMS.map((item, i) => (
          <li key={item.slug} className="rounded-3xl glass p-4 shadow-elegant sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold">{item.title}</h3>
              <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                {item.category}
              </span>
            </div>

            <CompareSlider
              before={{
                src: `/gallery/${item.slug}-before.jpg`,
                base: `/gallery/${item.slug}-before`,
                widths: [300, 600, 900],
                width: 900,
                height: 675,
              }}
              after={{
                src: `/gallery/${item.slug}-after.jpg`,
                base: `/gallery/${item.slug}-after`,
                widths: [300, 600, 900],
                width: 900,
                height: 675,
              }}
              beforeAlt={`${item.title} — original low-quality version`}
              afterAlt={`${item.title} — AI enhanced high-resolution version`}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : undefined}
            />

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-foreground">Problem:</dt>
                <dd className="text-muted-foreground">{item.problem}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-foreground">Enhancement:</dt>
                <dd className="text-muted-foreground">{item.enhancement}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-foreground">Result:</dt>
                <dd className="text-muted-foreground">{item.result}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Examples are illustrative. Actual results depend on the quality and content of your original
        image.
      </p>
    </section>
  );
}
