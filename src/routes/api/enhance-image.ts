import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  image: z.string().min(1),
  scale: z.enum(["4k", "8k"]).default("4k"),
});

function buildPrompt(scale: "4k" | "8k") {
  const target = scale === "8k" ? "8K ultra-high resolution" : "4K ultra-high resolution";
  return [
    `Restore and upscale this image to ${target}.`,
    "Dramatically increase sharpness, clarity and fine detail.",
    "Remove noise, blur, compression artifacts and pixelation.",
    "Reconstruct realistic textures (skin, hair, fabric, foliage, surfaces).",
    "Improve lighting, dynamic range and color accuracy.",
    "Keep the exact same subject, composition, framing and content — do NOT add, remove or invent objects, and do not change the style.",
    "Output only the enhanced photorealistic image.",
  ].join(" ");
}

export const Route = createFileRoute("/api/enhance-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "AI is not configured." }, { status: 500 });
        }

        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image",
            modalities: ["image", "text"],
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: buildPrompt(parsed.scale) },
                  { type: "image_url", image_url: { url: parsed.image } },
                ],
              },
            ],
          }),
        });

        if (upstream.status === 429) {
          return Response.json(
            { error: "Rate limit reached. Please try again in a moment." },
            { status: 429 },
          );
        }
        if (upstream.status === 402) {
          return Response.json(
            { error: "AI credits exhausted. Please add credits to continue." },
            { status: 402 },
          );
        }
        if (!upstream.ok) {
          const detail = await upstream.text();
          return Response.json(
            { error: "Enhancement failed.", detail },
            { status: 502 },
          );
        }

        const data = (await upstream.json()) as Record<string, unknown>;

        // Extract the generated image URL/data across possible response shapes.
        const choices = (data.choices as Array<Record<string, unknown>>) ?? [];
        const message = (choices[0]?.message ?? {}) as Record<string, unknown>;
        const images = (message.images as Array<Record<string, unknown>>) ?? [];
        let resultUrl: string | undefined;

        if (images.length > 0) {
          const first = images[0] as { image_url?: { url?: string }; url?: string };
          resultUrl = first.image_url?.url ?? first.url;
        }

        if (!resultUrl && Array.isArray(data.data)) {
          const d = data.data[0] as { url?: string; b64_json?: string };
          if (d?.url) resultUrl = d.url;
          else if (d?.b64_json) resultUrl = `data:image/png;base64,${d.b64_json}`;
        }

        if (!resultUrl) {
          return Response.json(
            { error: "No image returned.", detail: JSON.stringify(data).slice(0, 500) },
            { status: 502 },
          );
        }

        return Response.json({ image: resultUrl });
      },
    },
  },
});
