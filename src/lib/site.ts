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
    a: "Yes. Pixel Perfect Pro is completely free to use. There is no subscription, trial, watermark or payment step — you can upload a photo and download the enhanced version without ever entering card details.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. There is no sign-up, login or email required. You open the site, upload an image and enhance it. Because there is no account, we do not build a user profile or ask for personal information.",
  },
  {
    q: "Which image formats can I upload?",
    a: "You can upload JPG and JPEG (best for photos), PNG (best for screenshots, graphics and transparency) and WEBP (a modern web format). The enhanced result is returned as a high-resolution PNG you can download instantly.",
  },
  {
    q: "What is the maximum upload size?",
    a: "Each image can be up to 15MB. This comfortably covers typical phone and camera photos. If a file is larger, exporting it at a slightly lower quality or resizing it before upload usually brings it under the limit.",
  },
  {
    q: "Is my uploaded image stored or shared?",
    a: "Your image is sent securely to the AI only to generate the enhanced result for that single request. It is not saved to a public gallery, used for advertising, sold or shared with third parties for their own purposes.",
  },
  {
    q: "Who owns the images I upload and download?",
    a: "You do. You keep full ownership of both the original photo you upload and the enhanced image you download. We claim no rights over your content.",
  },
  {
    q: "Does it work on mobile phones and tablets?",
    a: "Yes. The entire tool runs in the browser and the layout adapts to any screen, so it works the same on phones, tablets, laptops and desktops. There is no app to install.",
  },
  {
    q: "How long does enhancement take?",
    a: "Most images finish in a few seconds. Larger files, 8K output, a slow connection or heavy demand on the AI can add a little time. A progress indicator shows that work is in progress.",
  },
  {
    q: "What is the difference between 4K and 8K?",
    a: "4K produces a sharp, high-resolution result quickly and suits most everyday uses. 8K pushes resolution and fine detail further, which is useful for large prints or heavy cropping, but takes a little longer to process.",
  },
  {
    q: "Will enhancing improve every single image?",
    a: "It improves the large majority of photos by sharpening edges, reducing noise and reconstructing detail. Results depend on the source: a reasonably clear photo improves more than an image that is extremely small, heavily compressed or badly damaged.",
  },
  {
    q: "Can the AI invent detail that was never there?",
    a: "The AI reconstructs plausible detail based on patterns it has learned — it does not recover information that the original image never captured. On faces, text or fine markings it can subtly reinterpret detail, so always review the result before important use.",
  },
  {
    q: "Can I restore old or scanned photographs?",
    a: "Yes. The AI is well suited to old, faded or scanned prints: it can reduce grain and scanning noise, recover softened detail and upscale the photo to a much higher resolution for reprinting or sharing.",
  },
  {
    q: "What quality is the downloaded file?",
    a: "You download the full enhanced image at the resolution you selected, without an added watermark. Save it and it is ready to print, post or reuse.",
  },
];
