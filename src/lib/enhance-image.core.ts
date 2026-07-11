// Core, framework-agnostic logic for the image-enhancement endpoint.
//
// Kept out of the route file so it can be unit-tested directly with a mock
// `fetch` (the route file imports `createFileRoute`, which is awkward to test).
// The route (`src/routes/api/enhance-image.ts`) is a thin adapter over
// `handleEnhanceImage`.

import { z } from "zod";

import { jsonFail, jsonOk } from "./api-response";
import { log, newRequestId } from "./logger";
import { metrics } from "./metrics";
import { clientKeyFromRequest, createRateLimiter, type RateLimiter } from "./rate-limit";

// ---- Validation ------------------------------------------------------------

// Only supported raster formats, encoded as a base64 data URL.
export const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
// Base64 inflates bytes ~33%; ~20MB of base64 ≈ ~15MB decoded binary.
export const MAX_BASE64_BYTES = 20 * 1024 * 1024;
// Hard cap on the raw request body. The JSON envelope wraps the image string in
// `{"image":"...","scale":"..."}`, so allow a small margin over the image cap.
// Enforced from the Content-Length header BEFORE the body is buffered, so an
// oversized payload is rejected without reading it into memory.
export const MAX_BODY_BYTES = MAX_BASE64_BYTES + 1024;

export const BodySchema = z.object({
  image: z
    .string()
    .min(1, "Image is required.")
    .max(MAX_BASE64_BYTES, "Image is too large.")
    .regex(DATA_URL_RE, "Unsupported image format."),
  scale: z.enum(["4k", "8k"]).default("4k"),
});

export type EnhanceBody = z.infer<typeof BodySchema>;

export function buildPrompt(scale: "4k" | "8k"): string {
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

// ---- Response extraction ---------------------------------------------------

export function extractImageUrl(data: Record<string, unknown>): string | undefined {
  const choices = (data.choices as Array<Record<string, unknown>>) ?? [];
  const message = (choices[0]?.message ?? {}) as Record<string, unknown>;
  const images = (message.images as Array<Record<string, unknown>>) ?? [];

  if (images.length > 0) {
    const first = images[0] as { image_url?: { url?: string }; url?: string };
    const url = first.image_url?.url ?? first.url;
    if (url) return url;
  }

  if (Array.isArray(data.data)) {
    const d = data.data[0] as { url?: string; b64_json?: string };
    if (d?.url) return d.url;
    if (d?.b64_json) return `data:image/png;base64,${d.b64_json}`;
  }

  return undefined;
}

// ---- AI provider communication (timeout + bounded retry) -------------------

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/images/generations";
export const MODEL = "google/gemini-3-pro-image";

export class TimeoutError extends Error {
  constructor() {
    super("AI request timed out.");
    this.name = "TimeoutError";
  }
}

// Raised when the *client* disconnects mid-flight (incoming request aborted).
// Distinct from TimeoutError so the retry loop terminates immediately instead
// of doing further unnecessary processing for a caller that is gone.
export class ClientAbortError extends Error {
  constructor() {
    super("Client aborted the request.");
    this.name = "ClientAbortError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  externalSignal?: AbortSignal,
): Promise<Response> {
  // Fast-path: the client already went away before we even dispatched.
  if (externalSignal?.aborted) throw new ClientAbortError();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // Propagate a client disconnect into the upstream processing request so the
  // work is stopped immediately instead of running to completion unobserved.
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (timedOut) throw new TimeoutError();
      if (externalSignal?.aborted) throw new ClientAbortError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry ONLY transient failures (timeouts + 5xx). Never retry 4xx: a 429 is
// surfaced to the caller (client should back off), and 400/402 are terminal.
export async function callGatewayWithRetry(args: {
  apiKey: string;
  body: unknown;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl: typeof fetch;
  onTimeout?: () => void;
  signal?: AbortSignal;
}): Promise<Response> {
  const { apiKey, body, timeoutMs, maxRetries, fetchImpl, onTimeout, signal } = args;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    // Stop before starting another upstream request if the client already left.
    if (signal?.aborted) throw new ClientAbortError();
    try {
      const res = await fetchWithTimeout(
        GATEWAY_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        timeoutMs,
        fetchImpl,
        signal,
      );

      // Retry transient upstream 5xx (but not the final attempt).
      if (res.status >= 500 && res.status < 600 && attempt < maxRetries) {
        attempt += 1;
        await sleep(250 * 2 ** (attempt - 1));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      // A client disconnect is terminal — never retry a caller that is gone.
      if (err instanceof ClientAbortError) throw err;
      if (err instanceof TimeoutError) onTimeout?.();
      if (attempt >= maxRetries) break;
      attempt += 1;
      await sleep(250 * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error("AI request failed.");
}

// ---- Orchestration ---------------------------------------------------------

export type EnhanceDeps = {
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
  rateLimiter?: RateLimiter;
  timeoutMs?: number;
  maxRetries?: number;
};

// Shared, module-level limiter so all requests in an isolate share the window.
// ~15 enhancement requests per IP per minute (see rate-limit.ts limitation note).
const defaultRateLimiter = createRateLimiter({ limit: 15, windowMs: 60_000 });

export async function handleEnhanceImage(request: Request, deps: EnhanceDeps): Promise<Response> {
  const requestId = newRequestId();
  const start = Date.now();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const rateLimiter = deps.rateLimiter ?? defaultRateLimiter;
  const timeoutMs = deps.timeoutMs ?? 60_000;
  const maxRetries = deps.maxRetries ?? 2;

  metrics.requestStarted();
  log.info("enhance.request.start", { requestId });

  // 1) Server misconfiguration.
  if (!deps.apiKey) {
    metrics.failed(Date.now() - start);
    log.error("enhance.config.missing_key", { requestId });
    return jsonFail("ai_unconfigured", "AI is not configured.", { status: 500, requestId });
  }

  // 2) Rate limiting (before any parsing / AI work).
  const key = clientKeyFromRequest(request);
  const rl = rateLimiter.check(key);
  if (!rl.allowed) {
    metrics.rateLimited();
    log.warn("enhance.ratelimited", { requestId, resetSec: rl.resetSec });
    return jsonFail("rate_limited", "Too many requests. Please slow down.", {
      status: 429,
      requestId,
      details: { retryAfterSec: rl.resetSec },
      headers: {
        "Retry-After": String(rl.resetSec),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
      },
    });
  }

  // 3) Reject oversized bodies from the Content-Length header BEFORE buffering,
  //    so a malicious multi-hundred-MB payload never gets read into memory.
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    metrics.validationRejected();
    metrics.failed(Date.now() - start);
    log.warn("enhance.payload.too_large", { requestId, contentLength });
    return jsonFail("payload_too_large", "Image is too large. Please upload a file under 15MB.", {
      status: 413,
      requestId,
    });
  }

  // 4) Input validation — invalid requests never reach the AI provider.
  let parsed: EnhanceBody;
  try {
    const raw = await request.json();
    parsed = BodySchema.parse(raw);
  } catch (err) {
    metrics.validationRejected();
    metrics.failed(Date.now() - start);
    const message =
      err instanceof z.ZodError
        ? "Invalid image. Please upload a JPG, PNG or WEBP under 15MB."
        : "Malformed request body.";
    log.warn("enhance.validation.failed", { requestId });
    return jsonFail("invalid_request", message, { status: 400, requestId });
  }

  const imageBytes = parsed.image.length;
  log.info("enhance.validation.ok", { requestId, scale: parsed.scale, imageBytes });

  // 5) Call the AI provider with timeout + bounded retry.
  log.info("enhance.ai.start", { requestId, scale: parsed.scale });
  let upstream: Response;
  try {
    upstream = await callGatewayWithRetry({
      apiKey: deps.apiKey,
      timeoutMs,
      maxRetries,
      fetchImpl,
      signal: request.signal,
      onTimeout: () => metrics.aiTimeout(),
      body: {
        model: MODEL,
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
      },
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    // Client disconnected mid-flight: the upstream call was aborted. This is not
    // a server failure, so don't pollute failure metrics — record it separately.
    if (err instanceof ClientAbortError) {
      metrics.clientAborted();
      log.info("enhance.client.aborted", { requestId, durationMs });
      return new Response(null, { status: 499 });
    }
    metrics.failed(durationMs);
    if (err instanceof TimeoutError) {
      log.error("enhance.ai.timeout", { requestId, durationMs });
      return jsonFail("ai_timeout", "The enhancement timed out. Please try again.", {
        status: 504,
        requestId,
      });
    }
    log.error("enhance.ai.network_error", { requestId, durationMs });
    return jsonFail("ai_unreachable", "Could not reach the AI service. Please try again.", {
      status: 502,
      requestId,
    });
  }

  // 6) Map upstream status codes to standardized errors.
  if (upstream.status === 429) {
    metrics.failed(Date.now() - start);
    log.warn("enhance.ai.upstream_429", { requestId });
    return jsonFail("ai_rate_limited", "Rate limit reached. Please try again in a moment.", {
      status: 429,
      requestId,
    });
  }
  if (upstream.status === 402) {
    metrics.failed(Date.now() - start);
    log.error("enhance.ai.credits_exhausted", { requestId });
    return jsonFail(
      "ai_credits_exhausted",
      "AI credits exhausted. Please add credits to continue.",
      {
        status: 402,
        requestId,
      },
    );
  }
  if (!upstream.ok) {
    const durationMs = Date.now() - start;
    metrics.failed(durationMs);
    log.error("enhance.ai.upstream_error", { requestId, status: upstream.status, durationMs });
    return jsonFail("ai_failed", "Enhancement failed. Please try again.", {
      status: 502,
      requestId,
    });
  }

  // 7) Parse + extract the generated image.
  let data: Record<string, unknown>;
  try {
    data = (await upstream.json()) as Record<string, unknown>;
  } catch {
    metrics.failed(Date.now() - start);
    log.error("enhance.ai.bad_json", { requestId });
    return jsonFail("ai_failed", "Enhancement failed. Please try again.", {
      status: 502,
      requestId,
    });
  }

  const resultUrl = extractImageUrl(data);
  if (!resultUrl) {
    metrics.failed(Date.now() - start);
    log.error("enhance.ai.no_image", { requestId });
    return jsonFail("no_image", "No image returned. Please try again.", {
      status: 502,
      requestId,
    });
  }

  // 8) Success.
  const durationMs = Date.now() - start;
  metrics.succeeded(durationMs);
  log.info("enhance.request.success", { requestId, scale: parsed.scale, durationMs });
  return jsonOk({ image: resultUrl, scale: parsed.scale }, { requestId });
}
