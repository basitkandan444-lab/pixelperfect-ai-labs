// Hosted "Max / Studio" enhancement endpoint.
//
// This is the ONLY path that reaches generative face-restoration quality
// (GFPGAN / Real-ESRGAN class results): it sends the uploaded image to a real
// image-restoration model through the Lovable AI Gateway, which SYNTHESISES new
// plausible detail (skin texture, hair strands, sharp eyes) rather than only
// sharpening what already exists. The client then upscales the restored image
// to the requested 4K/8K target with the high-quality resampler.
//
// The free, on-device engines (classical / neural) remain the default; this
// path is opt-in ("Max quality") and consumes AI credits per image.

import { createFileRoute } from "@tanstack/react-router";

// Higher-quality Gemini image model — image-to-image restoration/editing.
const MODEL_ID = "google/gemini-3-pro-image";

const RESTORE_PROMPT =
  "Restore and enhance this photo to ultra-realistic, high-resolution quality. " +
  "Recover fine, realistic detail: natural skin texture and pores, individual hair " +
  "strands, sharp well-defined eyes, eyelashes and eyebrows, crisp edges on clothing " +
  "and background. Remove blur, pixelation, JPEG compression artifacts and noise. " +
  "Preserve the subject's identity, facial features, pose, expression, framing, colors " +
  "and overall composition EXACTLY — do not change who the person is, and do not add or " +
  "remove any elements. Output a clean, photorealistic, natural-looking result.";

interface RequestBody {
  image?: unknown;
}

export const Route = createFileRoute("/api/enhance-max")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return Response.json(
            { error: "AI enhancement is not configured on this deployment." },
            { status: 500 },
          );
        }

        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }

        const image = body.image;
        if (typeof image !== "string" || !image.startsWith("data:image/")) {
          return Response.json(
            { error: "A valid image (data URL) is required." },
            { status: 400 },
          );
        }
        // Guard against absurdly large payloads (matches the 15MB client cap,
        // plus base64 overhead).
        if (image.length > 22 * 1024 * 1024) {
          return Response.json({ error: "Image is too large." }, { status: 413 });
        }

        let upstream: Response;
        try {
          upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: MODEL_ID,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: RESTORE_PROMPT },
                    { type: "image_url", image_url: { url: image } },
                  ],
                },
              ],
              modalities: ["image", "text"],
            }),
          });
        } catch {
          return Response.json(
            { error: "Could not reach the AI enhancement service. Please try again." },
            { status: 502 },
          );
        }

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          if (upstream.status === 402) {
            return Response.json(
              {
                error:
                  "The AI enhancement workspace is out of credits. Add credits to use Max quality.",
                code: "no_credits",
              },
              { status: 402 },
            );
          }
          if (upstream.status === 429) {
            return Response.json(
              { error: "Too many requests right now. Please try again in a moment." },
              { status: 429 },
            );
          }
          console.error(`enhance-max upstream failed [${upstream.status}]: ${detail.slice(0, 500)}`);
          return Response.json(
            { error: "AI enhancement failed. Please try again or use the free engines." },
            { status: 502 },
          );
        }

        let payload: { data?: Array<{ b64_json?: string }> };
        try {
          payload = (await upstream.json()) as typeof payload;
        } catch {
          return Response.json(
            { error: "AI enhancement returned an unexpected response." },
            { status: 502 },
          );
        }

        const b64 = payload.data?.[0]?.b64_json;
        if (!b64) {
          return Response.json(
            {
              error:
                "The AI model did not return an image for this input. Try a different photo or the free engines.",
            },
            { status: 502 },
          );
        }

        return Response.json({ image: `data:image/png;base64,${b64}` });
      },
    },
  },
});
