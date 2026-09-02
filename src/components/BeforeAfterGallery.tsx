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
    <section aria-labelledby="gallery-heading" className="mt-32">
      <div className="text-center">
        <span className="eyebrow">
          Real-world Output
        </span>
        <h2
          id="gallery-heading"
          className="mx-auto mt-6 max-w-2xl text-display !text-[clamp(2.5rem,6vw,4.5rem)]"
        >
          Visual Case Studies
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Drag the slider on each example to see how our AI image enhancer sharpens detail, reduces
          noise and restores clarity across different types of photos.
        </p>
      </div>

      <ul className="mt-16 grid list-none grid-cols-1 gap-8 p-0 lg:grid-cols-2">
        {ITEMS.map((item, i) => (
          <li key={item.slug} className="rounded-xl border border-border bg-surface-low p-6 shadow-subtle sm:p-8 reveal">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h3 className="text-display !text-xl">{item.title}</h3>
              <span className="shrink-0 rounded-md border border-border bg-surface-mid px-3 py-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                {item.category}
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border border-border shadow-elevated">
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
                // Every gallery card sits below the fold: lazy-load them all so
                // they never compete with the hero LCP image for bandwidth.
                loading="lazy"

              />
            </div>

            <dl className="mt-8 space-y-4 eyebrow !text-[9px] leading-relaxed">
              <div className="flex gap-3">
                <dt className="shrink-0 font-bold text-foreground">Problem</dt>
                <dd className="text-muted-foreground">{item.problem}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="shrink-0 font-bold text-foreground">Process</dt>
                <dd className="text-muted-foreground">{item.enhancement}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="shrink-0 font-bold text-foreground">Outcome</dt>
                <dd className="text-muted-foreground">{item.result}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-center text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
        * Results vary based on source quality.
      </p>
    </section>
  );
}
