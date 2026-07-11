// Standardized API response envelopes shared by all server routes.
//
// Success: { success: true, data: {...} }
// Error:   { success: false, error: { code, message, details? } }
//
// A stable `requestId` is echoed on every response (success and error) so a
// browser report can be correlated with a structured server log line.

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId?: string;
};

export type ApiFailure = {
  success: false;
  error: ApiErrorBody;
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

const BASE_HEADERS: Record<string, string> = {
  // API responses are per-request and must never be cached by intermediaries.
  "Cache-Control": "no-store",
};

function mergeHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(BASE_HEADERS);
  if (extra) {
    for (const [key, value] of new Headers(extra).entries()) headers.set(key, value);
  }
  return headers;
}

export function jsonOk<T>(
  data: T,
  opts: { requestId?: string; status?: number; headers?: HeadersInit } = {},
): Response {
  const body: ApiSuccess<T> = { success: true, data };
  if (opts.requestId) body.requestId = opts.requestId;
  return Response.json(body, {
    status: opts.status ?? 200,
    headers: mergeHeaders(opts.headers),
  });
}

export function jsonFail(
  code: string,
  message: string,
  opts: {
    status?: number;
    details?: unknown;
    requestId?: string;
    headers?: HeadersInit;
  } = {},
): Response {
  const error: ApiErrorBody = { code, message };
  if (opts.details !== undefined) error.details = opts.details;
  const body: ApiFailure = { success: false, error };
  if (opts.requestId) body.requestId = opts.requestId;
  return Response.json(body, {
    status: opts.status ?? 500,
    headers: mergeHeaders(opts.headers),
  });
}
