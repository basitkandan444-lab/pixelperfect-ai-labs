// Central site configuration used across routes, metadata and structured data.

export const SITE = {
  name: "Pixel Perfect Pro",
  shortName: "Pixel Perfect Pro",
  title: "Pixel Perfect Pro — Free AI Image Enhancer & Photo Upscaler",
  description:
    "Free AI image enhancer and photo upscaler. Turn blurry, low-quality photos into sharp 4K & 8K images — remove blur and noise, restore old photos. No signup.",
  // No custom domain yet — relative URLs resolve against the live host at request time.
  url: "",
  ogImage: "/og-image.jpg",
  twitter: "@pixelperfectpro",
  email: "hello@pixelperfect.pro",
} as const;

/**
 * Builds an absolute URL from a request origin and path. Falls back to the
 * relative path when the origin is unknown (local/prerender) so we never emit
 * an invalid canonical.
 */
export function absoluteUrl(origin: string | undefined, path: string): string {
  return origin ? `${origin}${path}` : path;
}

/**
 * Builds a BreadcrumbList JSON-LD object for a subpage. Improves SEO rich
 * results and reflects the site's internal linking structure.
 */
export function breadcrumbSchema(
  origin: string | undefined,
  page: { name: string; path: string },
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl(origin, "/") },
      { "@type": "ListItem", position: 2, name: page.name, item: absoluteUrl(origin, page.path) },
    ],
  };
}

export const KEYWORDS = [
  "AI image enhancer",
  "free AI image enhancer",
  "AI photo enhancer",
  "image upscaler",
  "AI upscaler",
  "improve image quality",
  "increase image resolution",
  "sharpen blurry images",
  "restore old photos",
  "enhance low quality images",
  "convert low quality image to 4K",
  "photo restoration AI",
  "remove blur from image",
  "online AI image enhancer",
].join(", ");

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQS: FaqItem[] = [
  {
    q: "Is Pixel Perfect Pro really free?",
    a: "Yes. Pixel Perfect Pro is a completely free AI image enhancer. There is no subscription, trial or payment required to upscale and enhance your photos.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. You can enhance images straight away without signing up, logging in or providing an email address. Just upload a photo and enhance it.",
  },
  {
    q: "Which image formats are supported?",
    a: "You can upload JPG, JPEG, PNG and WEBP images up to 15MB. The enhanced result is delivered as a high-resolution image you can download instantly.",
  },
  {
    q: "Is my uploaded image stored?",
    a: "Your image is only used to generate the enhanced result during processing and is not stored permanently, shared or sold. You keep full ownership of every photo you upload.",
  },
  {
    q: "Can I use the website on my phone?",
    a: "Yes. Pixel Perfect Pro runs entirely in your browser and works on phones, tablets and desktops — there is nothing to install on any device.",
  },
  {
    q: "How long does enhancement take?",
    a: "Most images are enhanced in a few seconds. Larger files or 8K output can take a little longer depending on your connection and the current AI workload.",
  },
  {
    q: "Does the AI improve every image?",
    a: "It improves the vast majority of photos by sharpening detail and removing noise. Results depend on the source image, so extremely small or heavily damaged files may see more modest gains.",
  },
  {
    q: "Can I enhance old or scanned photographs?",
    a: "Yes. The AI is well suited to restoring old, faded or scanned photos — it can reduce grain, recover detail and upscale them to a much higher resolution.",
  },
];
