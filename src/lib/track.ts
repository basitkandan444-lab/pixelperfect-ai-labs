// Privacy-preserving, first-party product analytics client.
// - No PII (no IPs, no emails, no user IDs)
// - Session id is random and lives only in sessionStorage (per-tab)
// - UTM + referrer classification happens client-side
// - Beacon transport survives page unload
//
// Server: /api/public/events accepts one or a small batch.

export type EventName =
  | "page_view"
  | "upload_started"
  | "upload_completed"
  | "enhance_started"
  | "enhance_completed"
  | "download_completed"
  | "error"
  | "feature_interaction";

export interface EventInput {
  name: EventName | string;
  path?: string;
  duration_ms?: number;
  bytes?: number;
  ok?: boolean;
  error_code?: string;
  feature?: string;
}

const SESSION_KEY = "ppp_sid";
const START_KEY = "ppp_sst";
const LAST_KEY = "ppp_last";
const ENDPOINT = "/api/public/events";

function sid(): string {
  if (typeof window === "undefined") return "";
  let v = sessionStorage.getItem(SESSION_KEY);
  if (!v) {
    v = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, v);
    sessionStorage.setItem(START_KEY, String(Date.now()));
  }
  return v;
}

function classifySource(): {
  source: string;
  medium?: string;
  campaign?: string;
  refHost?: string;
} {
  if (typeof window === "undefined") return { source: "unknown" };
  const p = new URLSearchParams(window.location.search);
  const medium = p.get("utm_medium") ?? undefined;
  const campaign = p.get("utm_campaign") ?? undefined;
  const utmSource = p.get("utm_source");
  const ref = document.referrer;
  let refHost: string | undefined;
  try {
    if (ref) refHost = new URL(ref).hostname;
  } catch {
    /* ignore */
  }

  if (utmSource) {
    const m = (medium ?? "").toLowerCase();
    if (m === "email") return { source: "email", medium, campaign, refHost };
    if (m === "cpc" || m === "paid") return { source: "paid", medium, campaign, refHost };
    if (m === "social") return { source: "social", medium, campaign, refHost };
    return { source: "referral", medium, campaign, refHost };
  }
  if (!refHost) return { source: "direct", medium, campaign };
  const h = refHost.toLowerCase();
  if (/google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave/.test(h))
    return { source: "organic", refHost, medium, campaign };
  if (
    /facebook|instagram|twitter|x\.com|linkedin|reddit|pinterest|tiktok|youtube|threads|bsky/.test(
      h,
    )
  )
    return { source: "social", refHost, medium, campaign };
  return { source: "referral", refHost, medium, campaign };
}

function device(): {
  device_type: string;
  os: string;
  browser: string;
  screen_w: number;
  screen_h: number;
} {
  const ua = navigator.userAgent;
  const mobile = /Mobi|Android|iPhone/i.test(ua);
  const tablet =
    /iPad|Tablet/i.test(ua) || (mobile && Math.min(screen.width, screen.height) >= 600);
  let os = "other";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";
  let browser = "other";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  return {
    device_type: tablet ? "tablet" : mobile ? "mobile" : "desktop",
    os,
    browser,
    screen_w: screen.width,
    screen_h: screen.height,
  };
}

// Heuristic: obvious bots + missing UA features.
function uaKind(): "likely_human" | "needs_review" | "suspicious" {
  const ua = navigator.userAgent || "";
  if (/bot|crawler|spider|slurp|headless|puppeteer|playwright/i.test(ua)) return "suspicious";
  if (!ua || ua.length < 30) return "needs_review";
  if (typeof navigator.languages === "undefined" || navigator.languages.length === 0)
    return "needs_review";
  return "likely_human";
}

let queue: Record<string, unknown>[] = [];
let flushT: ReturnType<typeof setTimeout> | null = null;

function post(body: string) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* telemetry must never break the app */
  }
}

function flush() {
  if (flushT) {
    clearTimeout(flushT);
    flushT = null;
  }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  post(JSON.stringify(batch));
}

let commonMemo: Record<string, unknown> | null = null;
function common() {
  if (commonMemo) return commonMemo;
  const src = classifySource();
  const dev = device();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lang = (navigator.languages?.[0] ?? navigator.language ?? "").slice(0, 12);
  commonMemo = {
    session_id: sid(),
    source: src.source,
    medium: src.medium,
    campaign: src.campaign,
    referrer_host: src.refHost,
    timezone: tz,
    language: lang,
    ua_kind: uaKind(),
    ...dev,
  };
  return commonMemo;
}

/** Fire an event. Returns immediately; batches over 500ms to reduce request count. */
export function track(input: EventInput): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LAST_KEY, String(Date.now()));
    queue.push({
      ...common(),
      name: input.name,
      path: input.path ?? window.location.pathname,
      duration_ms: input.duration_ms,
      bytes: input.bytes,
      ok: input.ok,
      error_code: input.error_code,
      feature: input.feature,
    });
    if (queue.length >= 10) flush();
    else if (!flushT) flushT = setTimeout(flush, 500);
  } catch {
    /* ignore */
  }
}

/** Flush queued events on page hide / unload (best effort). */
export function initTracker(): void {
  if (typeof window === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
}
