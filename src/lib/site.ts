// Central site configuration used across routes, metadata and structured data.

export const SITE = {
  name: "Pixel Perfect Pro",
  shortName: "Pixel Perfect Pro",
  title: "Pixel Perfect Pro — Free AI Image Enhancer & Photo Upscaler",
  description:
    "Free AI image enhancer and photo upscaler. Turn blurry, low-quality photos into sharp 4K & 8K images — fix blur, remove noise and restore old photos online, no signup.",
  // No custom domain yet — relative URLs resolve against the live host at request time.
  url: "",
  ogImage: "/og-image.jpg",
  twitter: "@pixelperfectpro",
  email: "hello@pixelperfect.pro",
} as const;

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
    a: "Yes. Pixel Perfect Pro is a completely free AI image enhancer. There is no signup, no subscription and no payment required to upscale and enhance your photos.",
  },
  {
    q: "What image formats are supported?",
    a: "You can upload JPG, JPEG, PNG and WEBP images up to 15MB. The enhanced result is available as a high-resolution PNG download.",
  },
  {
    q: "Can it fix blurry or low-quality photos?",
    a: "Absolutely. The AI sharpens blurry images, removes noise and compression artifacts, and reconstructs fine detail to convert low-quality photos into crisp, high-resolution results.",
  },
  {
    q: "How does the AI upscaler increase resolution?",
    a: "Our AI super-resolution engine analyzes your image and intelligently rebuilds textures and edges, upscaling it to 4K or 8K quality while keeping the original subject and composition intact.",
  },
  {
    q: "Are my uploaded images private?",
    a: "Your image is only used to generate the enhanced result and is not shared or sold. Processing happens on demand and images are not stored permanently.",
  },
];
