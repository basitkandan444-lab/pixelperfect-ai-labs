// Search-intent landing pages for Pixel Perfect Pro.
//
// Each entry targets a genuinely different image-enhancement search intent and
// provides unique, human-first content. The data here drives the shared
// LandingPage renderer, per-route <head> metadata, and JSON-LD structured data,
// so there is a single source of truth for every landing page.

import { SITE, absoluteUrl, type FaqItem } from "@/lib/site";

/** Every registered landing-page route path (kept in sync with the route files). */
export type LandingPath =
  | "/ai-image-enhancer"
  | "/image-upscaler"
  | "/fix-blurry-photo"
  | "/restore-old-photo"
  | "/sharpen-image"
  | "/remove-image-noise"
  | "/increase-image-resolution"
  | "/enhance-low-quality-photo";

export interface RelatedLink {
  path: LandingPath;
  label: string;
  blurb: string;
}

export interface LandingContent {
  slug: string;
  path: LandingPath;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  intro: string;
  /** AI-readable "Quick Summary" — plain, factual, three short answers. */
  summary: { about: string; helps: string; solves: string };
  problem: string[];
  solution: string[];
  steps: string[];
  useCases: string[];
  privacy: string;
  faqs: FaqItem[];
  cta: string;
  related: RelatedLink[];
}

export const LANDING_PAGES: LandingContent[] = [
  {
    slug: "ai-image-enhancer",
    path: "/ai-image-enhancer",
    h1: "AI Image Enhancer",
    metaTitle: "AI Image Enhancer — Improve Photo Quality Free | Pixel Perfect Pro",
    metaDescription:
      "Enhance any photo with a free AI image enhancer. Sharpen detail, reduce noise and upscale to 4K or 8K in seconds. No signup, no watermark, no cost.",
    ogTitle: "Free AI Image Enhancer — Improve Any Photo Instantly",
    ogDescription:
      "Upload a photo and let AI sharpen, denoise and upscale it to 4K or 8K quality. Completely free, no account required.",
    intro:
      "Pixel Perfect Pro is a free AI image enhancer that automatically improves the clarity, detail and resolution of any photo. Upload an image and the AI does the rest — no manual sliders, no design skills and no software to install.",
    summary: {
      about:
        "A free, browser-based AI image enhancer that improves the overall quality of a photo in one step.",
      helps:
        "Anyone with a photo that looks soft, dull, noisy or low-resolution — from casual phone snaps to product shots and scans.",
      solves:
        "The AI analyses the image, reconstructs realistic detail and outputs a cleaner, sharper, higher-resolution version you can download instantly.",
    },
    problem: [
      "Most photos never look as good as the moment they captured. Small sensors, low light, heavy compression from messaging apps and years of re-saving all strip away detail, leaving images that look soft, grainy or flat.",
      "Traditional editing tools ask you to fix each of these problems by hand — adjusting sharpness, denoising, and resizing separately — which takes time and skill most people do not have.",
    ],
    solution: [
      "Pixel Perfect Pro combines several enhancements into a single automatic pass. Its AI super-resolution model predicts the detail a higher-quality version of your photo would contain, then rebuilds edges and textures while smoothing away noise and compression artifacts.",
      "Because everything happens in one step, you get a balanced, natural-looking result without touching a single slider — and you can push the resolution all the way to 4K or 8K when you need a larger, print-ready file.",
    ],
    steps: [
      "Open the enhancer and upload a JPG, PNG or WEBP image (up to 15MB).",
      "Choose your target quality — 4K for a fast, sharp result or 8K for maximum detail.",
      "Let the AI enhance the photo; a progress indicator shows the work in real time.",
      "Compare the before and after, then download the enhanced image as a high-resolution PNG.",
    ],
    useCases: [
      "Refresh dull or soft phone photos before sharing them",
      "Improve product images for online listings and marketplaces",
      "Clean up screenshots and graphics for presentations",
      "Prepare images for larger prints without visible pixelation",
    ],
    privacy:
      "Your image is sent securely to the AI only to generate your enhanced result for that single request. It is not added to a public gallery, sold or used for advertising, and you never have to create an account.",
    faqs: [
      {
        q: "What does an AI image enhancer actually do?",
        a: "It uses a trained model to reconstruct detail that low resolution, compression or blur removed — sharpening edges, reducing noise and increasing resolution — instead of simply stretching the existing pixels.",
      },
      {
        q: "Is the AI image enhancer free?",
        a: "Yes. There is no subscription, trial, watermark or payment step. You can enhance and download as many images as you like at no cost.",
      },
      {
        q: "Will every photo look better?",
        a: "The large majority improve noticeably. Results depend on the source: a reasonably clear photo gains more than one that is extremely tiny, heavily compressed or badly damaged.",
      },
    ],
    cta: "Enhance your first image free",
    related: [
      {
        path: "/image-upscaler",
        label: "Image Upscaler",
        blurb: "Enlarge photos to 4K or 8K without losing sharpness.",
      },
      {
        path: "/fix-blurry-photo",
        label: "Fix Blurry Photo",
        blurb: "Recover clarity from soft or out-of-focus shots.",
      },
      {
        path: "/enhance-low-quality-photo",
        label: "Enhance Low-Quality Photo",
        blurb: "Rescue small, compressed or degraded images.",
      },
    ],
  },
  {
    slug: "image-upscaler",
    path: "/image-upscaler",
    h1: "AI Image Upscaler",
    metaTitle: "AI Image Upscaler — Enlarge Photos to 4K & 8K Free | Pixel Perfect Pro",
    metaDescription:
      "Upscale images to 4K or 8K with a free AI image upscaler. Enlarge photos without blur or pixelation and keep detail sharp. No signup or watermark.",
    ogTitle: "Free AI Image Upscaler — Enlarge to 4K & 8K",
    ogDescription:
      "Increase image size without losing quality. The AI reconstructs detail as it enlarges, so upscaled photos stay crisp.",
    intro:
      "Pixel Perfect Pro is a free AI image upscaler that enlarges photos to 4K or 8K while keeping edges and textures sharp. Instead of stretching pixels, it rebuilds detail so bigger images still look clean.",
    summary: {
      about:
        "A free AI image upscaler that increases the pixel dimensions of a photo while reconstructing detail.",
      helps:
        "People who need a larger version of an image — for printing, cropping, banners or high-resolution displays.",
      solves:
        "The AI predicts and rebuilds fine detail as it enlarges, avoiding the blur and blockiness of ordinary resizing.",
    },
    problem: [
      "When you stretch a small image in a normal editor, each pixel is simply duplicated. The result looks soft, blocky and pixelated — fine for a thumbnail, useless for a print or a large screen.",
      "This is a real limitation whenever you only have a small original: an old download, a cropped section of a bigger photo, or an image saved at web resolution.",
    ],
    solution: [
      "An AI upscaler works differently. It has learned what real photographs look like at high resolution, so as it enlarges your image it fills in plausible edges and textures rather than blurry blocks.",
      "Pixel Perfect Pro lets you choose 4K for a fast, sharp enlargement or 8K when you need the maximum size and detail for big prints or heavy cropping.",
    ],
    steps: [
      "Upload the image you want to make bigger (JPG, PNG or WEBP, up to 15MB).",
      "Select 4K or 8K as your output resolution.",
      "Let the AI upscale and reconstruct detail as it enlarges the photo.",
      "Download the upscaled image as a high-resolution PNG.",
    ],
    useCases: [
      "Enlarge photos for posters, canvases and large-format prints",
      "Upscale a cropped section of a bigger image",
      "Prepare images for 4K and Retina displays",
      "Increase the size of web-resolution downloads for reuse",
    ],
    privacy:
      "Uploads are processed only to create your upscaled result for that single request. Nothing is stored permanently, sold or shared for advertising, and no account is needed.",
    faqs: [
      {
        q: "How much can I upscale an image?",
        a: "You can output at 4K or 8K resolution. The best results come from enlarging a reasonably clear original — the AI has more detail to build on.",
      },
      {
        q: "Why is AI upscaling better than resizing in an editor?",
        a: "Ordinary resizing duplicates existing pixels, which looks blurry. AI upscaling reconstructs new, realistic detail as it enlarges, so the bigger image stays sharp.",
      },
      {
        q: "Does upscaling change the look of my photo?",
        a: "It aims to preserve the original subject and colours while adding resolution and clarity. Always review fine details like text or faces before important use.",
      },
    ],
    cta: "Upscale an image to 4K or 8K",
    related: [
      {
        path: "/increase-image-resolution",
        label: "Increase Image Resolution",
        blurb: "Turn low-resolution files into high-resolution images.",
      },
      {
        path: "/ai-image-enhancer",
        label: "AI Image Enhancer",
        blurb: "Improve overall photo quality in one automatic pass.",
      },
      {
        path: "/sharpen-image",
        label: "Sharpen Image",
        blurb: "Add crisp definition to soft edges and details.",
      },
    ],
  },
  {
    slug: "fix-blurry-photo",
    path: "/fix-blurry-photo",
    h1: "Fix a Blurry Photo",
    metaTitle: "Fix Blurry Photos Online Free — AI Deblur Tool | Pixel Perfect Pro",
    metaDescription:
      "Fix blurry photos online for free. AI removes blur, recovers detail and sharpens soft or out-of-focus images in seconds. No signup, no watermark.",
    ogTitle: "Fix Blurry Photos Free with AI",
    ogDescription:
      "Turn soft, out-of-focus or motion-blurred photos into clear, sharp images. Free AI deblur, no account needed.",
    intro:
      "Pixel Perfect Pro helps you fix blurry photos for free. The AI recovers definition from soft, out-of-focus and motion-blurred images, rebuilding edges so the result looks clear and sharp.",
    summary: {
      about: "A free AI tool that reduces blur and restores sharpness in photos.",
      helps:
        "Anyone with a shot that came out soft — from camera shake, missed focus, movement or low light.",
      solves:
        "The AI reconstructs the crisp edges and texture that blur smeared away, then upscales the corrected image for a clean, sharp result.",
    },
    problem: [
      "Blur is one of the most common photo problems. A shaky hand, a moving subject, a missed autofocus or a dim room can turn a great moment into a soft, fuzzy image.",
      "Once blur is baked into a photo, basic sharpening tools only make edges look harsh — they cannot recover the detail that was lost.",
    ],
    solution: [
      "Pixel Perfect Pro's AI has learned the difference between blurred and sharp versions of countless images, so it can estimate the crisp detail a photo should contain and rebuild it.",
      "It targets soft edges, restores texture and reduces the smeared look of motion and focus blur, then outputs the corrected image at up to 8K resolution.",
    ],
    steps: [
      "Upload the blurry photo (JPG, PNG or WEBP, up to 15MB).",
      "Choose 4K or 8K output — higher resolution recovers finer detail.",
      "Let the AI deblur and rebuild sharp edges and texture.",
      "Compare before and after, then download the clear result.",
    ],
    useCases: [
      "Rescue a blurry photo of a special moment",
      "Sharpen shots ruined by camera shake",
      "Clarify a soft or slightly out-of-focus portrait",
      "Recover detail from low-light images that came out fuzzy",
    ],
    privacy:
      "Your blurry photo is used only to generate the corrected version for that single request. It is not stored permanently, sold or shared, and there is no account to create.",
    faqs: [
      {
        q: "Can AI really fix a blurry photo?",
        a: "Yes, within limits. It reconstructs plausible sharp detail based on what it has learned, which dramatically improves most soft and lightly blurred images. Extreme, heavy blur can only be improved so far.",
      },
      {
        q: "Does it work on motion blur and focus blur?",
        a: "It helps with both. Soft-focus and mild motion blur usually see the biggest improvement, while severe streaking from fast movement is harder to fully reverse.",
      },
      {
        q: "Will fixing blur change how people look?",
        a: "The AI aims to stay true to the subject, but on faces and text it can subtly reinterpret detail, so review the result before using it for anything important.",
      },
    ],
    cta: "Fix a blurry photo now",
    related: [
      {
        path: "/sharpen-image",
        label: "Sharpen Image",
        blurb: "Add crisp definition to edges and fine detail.",
      },
      {
        path: "/enhance-low-quality-photo",
        label: "Enhance Low-Quality Photo",
        blurb: "Improve small, compressed or degraded images.",
      },
      {
        path: "/ai-image-enhancer",
        label: "AI Image Enhancer",
        blurb: "One-step enhancement for overall photo quality.",
      },
    ],
  },
  {
    slug: "restore-old-photo",
    path: "/restore-old-photo",
    h1: "Restore Old Photos",
    metaTitle: "Restore Old Photos Free with AI — Repair & Enhance | Pixel Perfect Pro",
    metaDescription:
      "Restore old, faded or scanned photos for free. AI reduces grain, recovers detail and upscales vintage prints for reprinting. No signup, no watermark.",
    ogTitle: "Restore Old Photos Free with AI",
    ogDescription:
      "Bring faded, grainy and scanned photographs back to life. Free AI restoration and upscaling, no account required.",
    intro:
      "Pixel Perfect Pro helps you restore old photos for free. The AI reduces grain and scanning noise, recovers softened detail and upscales vintage prints so they are ready to reprint or share.",
    summary: {
      about: "A free AI tool that repairs and enhances old, faded or scanned photographs.",
      helps:
        "Families and archivists digitising prints, and anyone with aging photos they want to preserve.",
      solves:
        "The AI removes grain and scan artifacts, rebuilds soft detail and increases resolution so old images look clean and print-ready.",
    },
    problem: [
      "Old photographs fade, pick up scratches and grain, and lose sharpness over the years. Scanning them often adds its own noise and softness, so the digital copy can look worse than the print.",
      "Rebuilding that lost detail by hand takes specialist retouching skills and hours of careful work.",
    ],
    solution: [
      "Pixel Perfect Pro's AI is well suited to aged and scanned images. It reduces film grain and scanning noise, recovers the softened edges and textures of the original, and upscales the whole photo to a much higher resolution.",
      "The result is a cleaner, sharper digital version that holds up when reprinted at a larger size or shared with family.",
    ],
    steps: [
      "Scan or photograph the old print, then upload it (JPG, PNG or WEBP, up to 15MB).",
      "Choose 4K or 8K output — 8K is ideal for reprinting at a larger size.",
      "Let the AI reduce grain, recover detail and upscale the image.",
      "Download the restored photo as a high-resolution PNG.",
    ],
    useCases: [
      "Revive faded family photographs and portraits",
      "Clean up grainy or noisy scans of old prints",
      "Prepare vintage photos for reprinting at a larger size",
      "Digitise and preserve aging photo albums",
    ],
    privacy:
      "Your photo is used only to create the restored version for that single request. It is never added to a public gallery, sold or shared, and no account is required to use the tool.",
    faqs: [
      {
        q: "Can it restore very old or damaged photos?",
        a: "It excels at reducing grain and noise and recovering soft detail. It can noticeably improve faded and worn prints, though it cannot invent detail the original never captured on heavily damaged areas.",
      },
      {
        q: "Should I scan the print first?",
        a: "Yes — a clean scan or a well-lit, straight-on photo of the print gives the AI the most to work with and produces the best restoration.",
      },
      {
        q: "Will it add colour to black-and-white photos?",
        a: "The tool focuses on clarity, denoising and resolution rather than colourisation. It sharpens and cleans the photo while keeping its original tones.",
      },
    ],
    cta: "Restore an old photo free",
    related: [
      {
        path: "/remove-image-noise",
        label: "Remove Image Noise",
        blurb: "Clean up grain and speckle from scans and low light.",
      },
      {
        path: "/increase-image-resolution",
        label: "Increase Image Resolution",
        blurb: "Upscale small scans into large, print-ready files.",
      },
      {
        path: "/ai-image-enhancer",
        label: "AI Image Enhancer",
        blurb: "One-step quality boost for any photo.",
      },
    ],
  },
  {
    slug: "sharpen-image",
    path: "/sharpen-image",
    h1: "Sharpen an Image with AI",
    metaTitle: "Sharpen Images Online Free — AI Sharpening Tool | Pixel Perfect Pro",
    metaDescription:
      "Sharpen images online for free with AI. Add crisp definition to soft edges and fine detail without harsh halos. No signup, no watermark, no cost.",
    ogTitle: "Sharpen Images Free with AI",
    ogDescription:
      "Bring out crisp edges and fine detail in soft photos. Free AI sharpening that avoids the harsh look of manual filters.",
    intro:
      "Pixel Perfect Pro sharpens images for free using AI. Rather than the harsh halos of a basic sharpen filter, it rebuilds genuine edge detail so soft photos look naturally crisp.",
    summary: {
      about: "A free AI sharpening tool that restores crisp edges and fine detail.",
      helps: "Anyone with a photo that looks slightly soft, flat or lacking in definition.",
      solves:
        "The AI reconstructs true edge detail instead of just boosting contrast, giving a clean, natural sharpness without artifacts.",
    },
    problem: [
      "A basic sharpen slider only increases contrast along edges. Push it too far and photos gain ugly halos and crunchy noise while still looking soft where it matters.",
      "That approach cannot add detail that is not already there — it just exaggerates what exists, artifacts included.",
    ],
    solution: [
      "Pixel Perfect Pro's AI actually reconstructs edge and texture detail based on what a sharp version of the image should look like. It brings out definition in hair, fabric, text and fine lines without the halos and grain of a manual filter.",
      "It also upscales the sharpened image to 4K or 8K, so you get both crispness and resolution in a single step.",
    ],
    steps: [
      "Upload the soft or flat-looking image (JPG, PNG or WEBP, up to 15MB).",
      "Choose 4K or 8K output resolution.",
      "Let the AI reconstruct edge and texture detail for natural sharpness.",
      "Download the sharpened image as a high-resolution PNG.",
    ],
    useCases: [
      "Add definition to soft portraits and product shots",
      "Crisp up text and lines in screenshots and graphics",
      "Bring out fine texture in landscape and detail photos",
      "Refine images that look flat after heavy compression",
    ],
    privacy:
      "Your image is used only to generate the sharpened result for that single request. It is not stored permanently, sold or shared, and no account is needed.",
    faqs: [
      {
        q: "How is AI sharpening different from a sharpen filter?",
        a: "A filter boosts edge contrast and often adds halos and noise. AI sharpening reconstructs real edge and texture detail, so the image looks crisp and natural rather than over-processed.",
      },
      {
        q: "Can I sharpen a photo that is also blurry?",
        a: "Yes. Sharpening and deblurring go hand in hand here — the AI rebuilds detail in soft and lightly blurred images alike. For heavy blur, results are limited by how much detail remains.",
      },
      {
        q: "Will sharpening add noise to my photo?",
        a: "No. Unlike manual filters, the AI reduces noise while it sharpens, so you get cleaner definition rather than amplified grain.",
      },
    ],
    cta: "Sharpen an image free",
    related: [
      {
        path: "/fix-blurry-photo",
        label: "Fix Blurry Photo",
        blurb: "Recover clarity from soft or out-of-focus shots.",
      },
      {
        path: "/remove-image-noise",
        label: "Remove Image Noise",
        blurb: "Clean grain and speckle for a smoother result.",
      },
      {
        path: "/ai-image-enhancer",
        label: "AI Image Enhancer",
        blurb: "Improve overall quality in one automatic pass.",
      },
    ],
  },
  {
    slug: "remove-image-noise",
    path: "/remove-image-noise",
    h1: "Remove Image Noise with AI",
    metaTitle: "Remove Image Noise Free — AI Photo Denoiser | Pixel Perfect Pro",
    metaDescription:
      "Remove noise and grain from photos for free with AI. Clean up low-light shots, high-ISO images and scans while keeping detail. No signup, no watermark.",
    ogTitle: "Remove Image Noise Free with AI",
    ogDescription:
      "Clean grain and speckle from low-light and high-ISO photos without smearing detail. Free AI denoiser, no account.",
    intro:
      "Pixel Perfect Pro removes image noise for free using AI. It clears the grain and colour speckle common in low-light, high-ISO and scanned photos while preserving the detail that matters.",
    summary: {
      about: "A free AI denoiser that removes grain and speckle from photos.",
      helps: "Anyone with noisy low-light, high-ISO or scanned images.",
      solves:
        "The AI separates real detail from random noise, cleaning the image without the smeared, plastic look of ordinary denoise filters.",
    },
    problem: [
      "Noise appears as grain and coloured speckle, especially in low light or when a camera uses a high ISO setting. Scanned prints add their own texture of noise on top.",
      "Standard denoise filters remove grain by blurring the whole image, which smears away fine detail and leaves photos looking soft and plastic.",
    ],
    solution: [
      "Pixel Perfect Pro's AI can tell the difference between genuine detail and random noise. It clears grain and speckle while keeping edges, texture and fine features intact.",
      "The cleaned image is also sharpened and upscaled to 4K or 8K, so you get a smoother, higher-resolution result in one pass.",
    ],
    steps: [
      "Upload the noisy or grainy image (JPG, PNG or WEBP, up to 15MB).",
      "Choose 4K or 8K output resolution.",
      "Let the AI remove noise while preserving real detail.",
      "Download the clean, high-resolution image.",
    ],
    useCases: [
      "Clean up low-light and night photos",
      "Reduce grain in high-ISO shots",
      "Remove noise from scanned prints and documents",
      "Smooth out heavily compressed images without losing detail",
    ],
    privacy:
      "Your image is used only to create the denoised result for that single request. Nothing is stored permanently, sold or shared, and no account is required.",
    faqs: [
      {
        q: "Does noise removal make photos look blurry?",
        a: "No. Unlike a blur-based filter, the AI removes noise while keeping edges and texture sharp, so the result looks clean rather than soft.",
      },
      {
        q: "What kinds of noise can it handle?",
        a: "It handles luminance grain and colour speckle from low light and high ISO, as well as the noise introduced when scanning old prints.",
      },
      {
        q: "Can I denoise and upscale at the same time?",
        a: "Yes. Every enhancement runs in one pass — the AI removes noise, sharpens detail and increases resolution together.",
      },
    ],
    cta: "Remove noise from an image",
    related: [
      {
        path: "/restore-old-photo",
        label: "Restore Old Photo",
        blurb: "Repair grainy, faded and scanned prints.",
      },
      {
        path: "/sharpen-image",
        label: "Sharpen Image",
        blurb: "Add crisp definition after cleaning noise.",
      },
      {
        path: "/enhance-low-quality-photo",
        label: "Enhance Low-Quality Photo",
        blurb: "Rescue small, compressed or degraded images.",
      },
    ],
  },
  {
    slug: "increase-image-resolution",
    path: "/increase-image-resolution",
    h1: "Increase Image Resolution",
    metaTitle: "Increase Image Resolution Free — AI to 4K & 8K | Pixel Perfect Pro",
    metaDescription:
      "Increase image resolution for free with AI. Convert low-resolution photos into sharp 4K or 8K images without blur or pixelation. No signup or watermark.",
    ogTitle: "Increase Image Resolution Free with AI",
    ogDescription:
      "Turn low-resolution photos into high-resolution 4K or 8K images that stay sharp. Free AI, no account required.",
    intro:
      "Pixel Perfect Pro increases image resolution for free using AI. It converts low-resolution photos into sharp 4K or 8K images by reconstructing detail as it enlarges — not by stretching pixels.",
    summary: {
      about: "A free AI tool that raises the resolution of a photo to 4K or 8K.",
      helps:
        "Anyone whose image is too low-resolution for printing, large screens or professional use.",
      solves:
        "The AI rebuilds realistic detail while increasing pixel dimensions, so higher-resolution output stays crisp instead of blurry.",
    },
    problem: [
      "Low-resolution images look fine as thumbnails but fall apart when printed, displayed on a large screen or used in a design. There simply are not enough pixels to hold detail.",
      "Increasing resolution in a normal editor duplicates pixels and produces a soft, blocky image — more pixels, but no more real detail.",
    ],
    solution: [
      "Pixel Perfect Pro adds resolution intelligently. Its AI reconstructs the edges and textures a high-resolution version of the photo would contain, so the enlarged file genuinely looks sharper, not just bigger.",
      "Choose 4K for a fast, high-resolution result or 8K when you need the maximum pixel dimensions for large prints and professional work.",
    ],
    steps: [
      "Upload your low-resolution image (JPG, PNG or WEBP, up to 15MB).",
      "Select 4K or 8K as the output resolution.",
      "Let the AI reconstruct detail while raising the resolution.",
      "Download the high-resolution PNG.",
    ],
    useCases: [
      "Make images large enough to print sharply",
      "Prepare photos for 4K, Retina and large displays",
      "Meet minimum resolution requirements for uploads and designs",
      "Reuse small web images at a larger size",
    ],
    privacy:
      "Your image is processed only to generate the higher-resolution result for that single request. It is not stored permanently, sold or shared, and no account is needed.",
    faqs: [
      {
        q: "What resolution can I reach?",
        a: "You can output at 4K or 8K. The sharpest results come from a reasonably clear original, which gives the AI more detail to reconstruct.",
      },
      {
        q: "Is this the same as upscaling?",
        a: "They overlap. Increasing resolution raises the pixel dimensions; the AI upscaling engine reconstructs detail as it does so, so the larger image stays sharp.",
      },
      {
        q: "Will a tiny image become perfectly sharp?",
        a: "It will improve significantly, but the AI cannot recover detail the original never captured. A very small or heavily compressed source has natural limits.",
      },
    ],
    cta: "Increase image resolution free",
    related: [
      {
        path: "/image-upscaler",
        label: "Image Upscaler",
        blurb: "Enlarge photos to 4K or 8K without pixelation.",
      },
      {
        path: "/enhance-low-quality-photo",
        label: "Enhance Low-Quality Photo",
        blurb: "Rescue small, compressed or degraded images.",
      },
      {
        path: "/ai-image-enhancer",
        label: "AI Image Enhancer",
        blurb: "One-step quality boost for any photo.",
      },
    ],
  },
  {
    slug: "enhance-low-quality-photo",
    path: "/enhance-low-quality-photo",
    h1: "Enhance Low-Quality Photos",
    metaTitle: "Enhance Low-Quality Photos Free with AI | Pixel Perfect Pro",
    metaDescription:
      "Enhance low-quality photos for free with AI. Fix small, compressed and pixelated images by rebuilding detail and upscaling to 4K or 8K. No signup.",
    ogTitle: "Enhance Low-Quality Photos Free with AI",
    ogDescription:
      "Rescue small, compressed and pixelated images. The AI rebuilds detail and upscales to 4K or 8K. Free, no account.",
    intro:
      "Pixel Perfect Pro enhances low-quality photos for free. Whether an image is small, compressed or pixelated, the AI rebuilds detail, cleans artifacts and upscales it to a sharp 4K or 8K result.",
    summary: {
      about:
        "A free AI tool that improves photos degraded by low resolution, compression or pixelation.",
      helps: "Anyone stuck with a poor-quality image saved from the web, chat apps or old devices.",
      solves:
        "The AI removes compression artifacts, rebuilds lost detail and upscales the photo, turning a low-quality source into a clean, usable image.",
    },
    problem: [
      "Images shared through messaging apps, saved from the web or captured on older phones are often small, heavily compressed and full of blocky artifacts. Zoom in and they fall apart.",
      "There is usually no better copy available, and ordinary tools cannot rebuild the detail that compression threw away.",
    ],
    solution: [
      "Pixel Perfect Pro's AI is built for exactly this. It recognises and removes compression artifacts, reconstructs edges and textures, reduces noise and upscales the image in a single pass.",
      "The outcome is a cleaner, sharper, higher-resolution photo — a genuine improvement over the low-quality source, at 4K or 8K output.",
    ],
    steps: [
      "Upload the low-quality image (JPG, PNG or WEBP, up to 15MB).",
      "Choose 4K or 8K output resolution.",
      "Let the AI clean artifacts, rebuild detail and upscale the photo.",
      "Download the improved, high-resolution result.",
    ],
    useCases: [
      "Improve images saved from messaging apps and social media",
      "Fix pixelated or blocky compressed photos",
      "Rescue small images captured on older phones",
      "Clean up web-quality downloads for reuse",
    ],
    privacy:
      "Your image is used only to generate the enhanced result for that single request. It is not stored permanently, sold or shared, and no account is required.",
    faqs: [
      {
        q: "Can a very low-quality image be fixed?",
        a: "It can be improved substantially — the AI removes artifacts, rebuilds detail and upscales it. How far it can go depends on how much information survives in the original.",
      },
      {
        q: "Does it remove the blocky compression pattern?",
        a: "Yes. The AI is trained to recognise and reduce JPEG-style compression artifacts while reconstructing smoother, more natural detail.",
      },
      {
        q: "What if my image is both small and blurry?",
        a: "That is a common case. The tool sharpens, denoises and upscales together, so small and soft images are handled in the same pass.",
      },
    ],
    cta: "Enhance a low-quality photo",
    related: [
      {
        path: "/fix-blurry-photo",
        label: "Fix Blurry Photo",
        blurb: "Recover clarity from soft or out-of-focus shots.",
      },
      {
        path: "/increase-image-resolution",
        label: "Increase Image Resolution",
        blurb: "Convert low-resolution files into sharp 4K or 8K.",
      },
      {
        path: "/remove-image-noise",
        label: "Remove Image Noise",
        blurb: "Clean grain and speckle from degraded images.",
      },
    ],
  },
];

export function getLanding(slug: string): LandingContent {
  const page = LANDING_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`Unknown landing page: ${slug}`);
  return page;
}

/** Structured data (@graph) matching the visible content of a landing page. */
function landingSchema(origin: string | undefined, c: LandingContent) {
  const canonical = absoluteUrl(origin, c.path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: c.h1,
        description: c.metaDescription,
        url: canonical,
        isPartOf: { "@type": "WebSite", name: SITE.name, url: absoluteUrl(origin, "/") },
      },
      {
        "@type": "SoftwareApplication",
        name: SITE.name,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        description: c.metaDescription,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@type": "FAQPage",
        mainEntity: c.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl(origin, "/") },
          { "@type": "ListItem", position: 2, name: c.h1, item: canonical },
        ],
      },
    ],
  };
}

/** Builds the full <head> config (meta, canonical, JSON-LD) for a landing page. */
export function landingHead(origin: string | undefined, c: LandingContent) {
  const canonical = absoluteUrl(origin, c.path);
  return {
    meta: [
      { title: c.metaTitle },
      { name: "description", content: c.metaDescription },
      { property: "og:title", content: c.ogTitle },
      { property: "og:description", content: c.ogDescription },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: c.ogTitle },
      { name: "twitter:description", content: c.ogDescription },
    ],
    links: [{ rel: "canonical", href: canonical }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(landingSchema(origin, c)),
      },
    ],
  };
}
