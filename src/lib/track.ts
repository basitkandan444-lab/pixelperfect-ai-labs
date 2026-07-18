// Privacy-preserving, first-party product analytics client with ELITE DATA
// TRUST guarantees:
//
//   • event_id (uuid) on every event → server-side dedup
//   • monotonic per-session `seq` → mathematical gap detection
//   • client_ts on every event → out-of-order reordering possible
//   • persistent retry queue in localStorage → beacon loss recoverable
//   • in-flight enhancement marker in sessionStorage → silent abandonment
//     is emitted as `enhance_abandoned` on pagehide / visibilitychange
//
// No PII. Session id + event id are random UUIDs; nothing user-identifying
// leaves the browser.

export type EventName =
  | "page_view"
  | "route_change"
  | "upload_started"
  | "upload_completed"
  | "enhance_started"
  | "enhance_completed"
  | "enhance_failed"
  | "enhance_abandoned"
  | "download_started"
  | "download_completed"
  | "retry_performed"
  | "timeout_occurred"
  | "visibility_change"
  | "tab_closed"
  | "worker_crashed"
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
  metrics?: Record<string, unknown>;
}

const SESSION_KEY = "ppp_sid";
const START_KEY = "ppp_sst";
const LAST_KEY = "ppp_last";
const SEQ_KEY = "ppp_seq";
const INFLIGHT_KEY = "ppp_inflight";
const RETRY_KEY = "ppp_retry_v1";
const ENDPOINT = "/api/public/events";
const MAX_RETRY_BYTES = 128 * 1024; // 128 KB cap on persistent retry buffer

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function sid(): string {
  if (typeof window === "undefined") return "";
  let v = sessionStorage.getItem(SESSION_KEY);
  if (!v) {
    v = uuid();
    sessionStorage.setItem(SESSION_KEY, v);
    sessionStorage.setItem(START_KEY, String(Date.now()));
    sessionStorage.setItem(SEQ_KEY, "0");
  }
  return v;
}

function nextSeq(): number {
  if (typeof window === "undefined") return 0;
  const cur = Number(sessionStorage.getItem(SEQ_KEY) ?? "0") || 0;
  const n = cur + 1;
  sessionStorage.setItem(SEQ_KEY, String(n));
  return n;
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

// -------- persistent retry queue --------
// If a beacon fails (offline, blocked, keepalive rejected), the batch is
// persisted here and retried on next init + when back online. Bounded so an
// offline tab cannot grow it unboundedly.
function loadRetry(): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(RETRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveRetry(list: Record<string, unknown>[]) {
  try {
    // Keep newest under cap
    let s = JSON.stringify(list);
    while (s.length > MAX_RETRY_BYTES && list.length > 1) {
      list.shift();
      s = JSON.stringify(list);
    }
    localStorage.setItem(RETRY_KEY, s);
  } catch {
    /* storage may be full or disabled */
  }
}
function enqueueRetry(batch: Record<string, unknown>[]) {
  const list = loadRetry();
  list.push(...batch);
  saveRetry(list);
}
async function drainRetry() {
  const list = loadRetry();
  if (list.length === 0) return;
  // Chunk to <=20 events per request (matches server cap)
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < list.length; i += 20) chunks.push(list.slice(i, i + 20));
  const remaining: Record<string, unknown>[] = [];
  for (const chunk of chunks) {
    const ok = await sendJson(JSON.stringify(chunk));
    if (!ok) remaining.push(...chunk);
  }
  saveRetry(remaining);
}

async function sendJson(body: string): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function post(body: string, batch: Record<string, unknown>[]) {
  // sendBeacon is best-effort and returns false on some browsers even when the
  // request eventually succeeds. Use it as a fast path on unload but treat
  // failure as needing retry.
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }
  // fetch with keepalive; if it rejects/returns !ok, persist for retry.
  void sendJson(body).then((ok) => {
    if (!ok) enqueueRetry(batch);
  });
}

function flush() {
  if (flushT) {
    clearTimeout(flushT);
    flushT = null;
  }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  post(JSON.stringify(batch), batch);
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

// -------- in-flight enhancement tracking --------
// When enhance_started fires we record a marker; on any terminal event we
// clear it; on pagehide/visibilitychange(hidden) we flush a synthetic
// enhance_abandoned so silent tab-close is never invisible.
interface InflightMarker {
  event_id: string;
  started_at: number;
  metrics?: Record<string, unknown>;
}
function readInflight(): InflightMarker | null {
  try {
    const raw = sessionStorage.getItem(INFLIGHT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InflightMarker;
  } catch {
    return null;
  }
}
function writeInflight(m: InflightMarker | null) {
  try {
    if (m) sessionStorage.setItem(INFLIGHT_KEY, JSON.stringify(m));
    else sessionStorage.removeItem(INFLIGHT_KEY);
  } catch {
    /* ignore */
  }
}

/** Fire an event. Returns immediately; batches over 500ms to reduce request count. */
export function track(input: EventInput): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    sessionStorage.setItem(LAST_KEY, String(now));
    const eventId = uuid();
    const seq = nextSeq();
    const record: Record<string, unknown> = {
      ...common(),
      event_id: eventId,
      seq,
      client_ts: new Date(now).toISOString(),
      name: input.name,
      path: input.path ?? window.location.pathname,
      duration_ms: input.duration_ms,
      bytes: input.bytes,
      ok: input.ok,
      error_code: input.error_code,
      feature: input.feature,
      metrics: input.metrics,
    };

    // Maintain in-flight marker for abandonment detection.
    if (input.name === "enhance_started") {
      writeInflight({
        event_id: eventId,
        started_at: now,
        metrics: input.metrics as Record<string, unknown> | undefined,
      });
    } else if (
      input.name === "enhance_completed" ||
      input.name === "enhance_failed" ||
      input.name === "enhance_abandoned"
    ) {
      writeInflight(null);
    }

    queue.push(record);
    if (queue.length >= 10) flush();
    else if (!flushT) flushT = setTimeout(flush, 500);
  } catch {
    /* ignore */
  }
}

/** Emit an enhance_abandoned event if an enhancement was in flight. */
function emitAbandonmentIfInflight(reason: "hidden" | "pagehide" | "beforeunload") {
  const m = readInflight();
  if (!m) return;
  const duration = Date.now() - m.started_at;
  // Very small windows (<250ms) after a completion race are ignored to avoid
  // false abandonments when a terminal event and pagehide fire in the same
  // task queue.
  if (duration < 250) return;
  track({
    name: "enhance_abandoned",
    ok: false,
    error_code: reason,
    duration_ms: duration,
    metrics: { ...(m.metrics ?? {}), started_event_id: m.event_id },
  });
  // Force immediate flush — the tab may be closing.
  flush();
}

/** Flush queued events on page hide / unload (best effort). */
export function initTracker(): void {
  if (typeof window === "undefined") return;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      emitAbandonmentIfInflight("hidden");
      flush();
    }
  });
  window.addEventListener("pagehide", () => {
    emitAbandonmentIfInflight("pagehide");
    flush();
  });
  window.addEventListener("beforeunload", () => {
    emitAbandonmentIfInflight("beforeunload");
    flush();
  });

  // Attempt to drain persisted retry queue on startup and whenever the
  // network becomes available again.
  void drainRetry();
  window.addEventListener("online", () => {
    void drainRetry();
  });
}
