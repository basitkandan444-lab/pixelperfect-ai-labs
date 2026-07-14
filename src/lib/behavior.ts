// Privacy-safe behavioral collector.
// - Anonymous summaries only. No cursor paths, no keystrokes, no screen
//   recordings, no clipboard, no PII, no cross-site identifiers.
// - Runs entirely in the browser. On page hide it flushes one compact
//   `session_summary` event with metrics; rage/dead clicks fire inline.
//
// All output is small numeric summaries suitable for privacy-safe
// server-side classification.

import { track } from "./track";

export interface BehaviorMetrics {
  // Scroll
  scrollMaxPct: number;
  scrollAvgPct: number;
  scrollMilestones: { p10: boolean; p25: boolean; p50: boolean; p75: boolean; p90: boolean; p100: boolean };
  scrollUpCount: number;
  scrollPauseCount: number;
  scrollVelocityMean: number;
  scrollVelocityStd: number;
  timeToFirstScrollMs: number | null;
  // Mouse
  mouseMoves: number;
  mouseSpeedMean: number;
  mouseSpeedStd: number;
  mouseDirChanges: number;
  mouseIdleRatio: number;
  // Click rhythm
  clickCount: number;
  clickIntervalMean: number;
  clickIntervalStd: number;
  clickIntervalCV: number;
  burstClicks: number;
  // Hover
  hoverCount: number;
  hoverMeanMs: number;
  hoverAbandonRate: number;
  // Idle / reading
  idleMs: number;
  activeMs: number;
  longestActiveStreakMs: number;
  visibilityHides: number;
  // Network
  effectiveType: string | null;
  saveData: boolean | null;
  rtt: number | null;
  downlink: number | null;
  online: boolean;
  offlineTransitions: number;
  // Performance
  longTasks: number;
  cls: number;
  lcpMs: number | null;
  inpMs: number | null;
  memoryUsedMb: number | null;
  // Bot indicators
  webdriver: boolean;
  hasTouch: boolean;
  languages: number;
  hardwareConcurrency: number;
  timezoneOffset: number;
  // Derived reading estimate
  readingMode: "reading" | "scanning" | "abandoning" | "idle" | "unknown";
  // Duration
  sessionMs: number;
}

interface Runtime {
  started: number;
  lastActivity: number;
  activeMs: number;
  idleMs: number;
  longestActive: number;
  activeStreakStart: number;
  scrollMax: number;
  scrollSamples: number[];
  scrollVelocities: number[];
  scrollLastY: number;
  scrollLastT: number;
  scrollUp: number;
  scrollPauses: number;
  firstScrollAt: number | null;
  milestones: BehaviorMetrics["scrollMilestones"];
  mouseMoves: number;
  mouseSpeeds: number[];
  mouseDirChanges: number;
  mouseLastX: number;
  mouseLastY: number;
  mouseLastT: number;
  mouseLastDx: number;
  mouseLastDy: number;
  clickTimes: number[];
  hoverStarts: WeakMap<Element, number>;
  hoverDurations: number[];
  hoverWithoutClick: number;
  hoverLastEl: Element | null;
  hoverLastClickedAt: number;
  visibilityHides: number;
  offlineTransitions: number;
  wasOnline: boolean;
  longTasks: number;
  cls: number;
  lcpMs: number | null;
  inpMs: number | null;
  rageClicks: Map<string, { t: number[]; el: string }>;
  dead: { t: number; el: string }[];
  flushed: boolean;
}

let R: Runtime | null = null;

function stats(xs: number[]): { mean: number; std: number; cv: number } {
  if (xs.length === 0) return { mean: 0, std: 0, cv: 0 };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  const s = Math.sqrt(v);
  return { mean: m, std: s, cv: m > 0 ? s / m : 0 };
}

function activityTick() {
  if (!R) return;
  const now = performance.now();
  const dt = now - R.lastActivity;
  if (dt < 3000) {
    R.activeMs += dt;
    const streak = now - R.activeStreakStart;
    if (streak > R.longestActive) R.longestActive = streak;
  } else {
    R.idleMs += dt;
    R.activeStreakStart = now;
  }
  R.lastActivity = now;
}

function elKey(el: EventTarget | null): string {
  const e = el as Element | null;
  if (!e || !e.tagName) return "unknown";
  const id = (e as HTMLElement).id ? `#${(e as HTMLElement).id}` : "";
  const cls = (e as HTMLElement).className && typeof (e as HTMLElement).className === "string"
    ? "." + ((e as HTMLElement).className as string).split(/\s+/).slice(0, 2).join(".")
    : "";
  return `${e.tagName.toLowerCase()}${id}${cls}`.slice(0, 80);
}

function initBehaviorInternal() {
  if (R) return;
  R = {
    started: performance.now(),
    lastActivity: performance.now(),
    activeMs: 0,
    idleMs: 0,
    longestActive: 0,
    activeStreakStart: performance.now(),
    scrollMax: 0,
    scrollSamples: [],
    scrollVelocities: [],
    scrollLastY: window.scrollY,
    scrollLastT: performance.now(),
    scrollUp: 0,
    scrollPauses: 0,
    firstScrollAt: null,
    milestones: { p10: false, p25: false, p50: false, p75: false, p90: false, p100: false },
    mouseMoves: 0,
    mouseSpeeds: [],
    mouseDirChanges: 0,
    mouseLastX: 0,
    mouseLastY: 0,
    mouseLastT: performance.now(),
    mouseLastDx: 0,
    mouseLastDy: 0,
    clickTimes: [],
    hoverStarts: new WeakMap(),
    hoverDurations: [],
    hoverWithoutClick: 0,
    hoverLastEl: null,
    hoverLastClickedAt: 0,
    visibilityHides: 0,
    offlineTransitions: 0,
    wasOnline: navigator.onLine,
    longTasks: 0,
    cls: 0,
    lcpMs: null,
    inpMs: null,
    rageClicks: new Map(),
    dead: [],
    flushed: false,
  };

  // Scroll
  const onScroll = () => {
    if (!R) return;
    const now = performance.now();
    const y = window.scrollY;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.max(0, (y / max) * 100));
    if (R.firstScrollAt === null) R.firstScrollAt = now - R.started;
    if (pct > R.scrollMax) R.scrollMax = pct;
    R.scrollSamples.push(pct);
    if (R.scrollSamples.length > 200) R.scrollSamples.shift();
    const dy = y - R.scrollLastY;
    const dt = Math.max(1, now - R.scrollLastT);
    const v = Math.abs(dy) / dt;
    R.scrollVelocities.push(v);
    if (R.scrollVelocities.length > 200) R.scrollVelocities.shift();
    if (dy < 0) R.scrollUp += 1;
    if (Math.abs(dy) < 4) R.scrollPauses += 1;
    R.scrollLastY = y;
    R.scrollLastT = now;
    const ms = R.milestones;
    if (pct >= 10) ms.p10 = true;
    if (pct >= 25) ms.p25 = true;
    if (pct >= 50) ms.p50 = true;
    if (pct >= 75) ms.p75 = true;
    if (pct >= 90) ms.p90 = true;
    if (pct >= 99.5) ms.p100 = true;
    activityTick();
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  // Mouse — summaries only, no coordinates stored
  const onMouseMove = (e: MouseEvent) => {
    if (!R) return;
    const now = performance.now();
    const dx = e.clientX - R.mouseLastX;
    const dy = e.clientY - R.mouseLastY;
    const dt = Math.max(1, now - R.mouseLastT);
    const d = Math.hypot(dx, dy);
    if (d > 0.5) {
      R.mouseMoves += 1;
      R.mouseSpeeds.push(d / dt);
      if (R.mouseSpeeds.length > 400) R.mouseSpeeds.shift();
      if (
        (Math.sign(dx) !== Math.sign(R.mouseLastDx) && dx !== 0) ||
        (Math.sign(dy) !== Math.sign(R.mouseLastDy) && dy !== 0)
      )
        R.mouseDirChanges += 1;
      R.mouseLastDx = dx;
      R.mouseLastDy = dy;
    }
    R.mouseLastX = e.clientX;
    R.mouseLastY = e.clientY;
    R.mouseLastT = now;
    activityTick();
  };
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  // Click rhythm + rage + dead click detection
  const onClick = (e: MouseEvent) => {
    if (!R) return;
    const now = performance.now();
    R.clickTimes.push(now);
    if (R.clickTimes.length > 100) R.clickTimes.shift();
    const key = elKey(e.target);
    R.hoverLastClickedAt = now;
    // Rage: >=3 clicks within 800ms on same target key
    const rc = R.rageClicks.get(key) ?? { t: [], el: key };
    rc.t.push(now);
    rc.t = rc.t.filter((t) => now - t < 800);
    R.rageClicks.set(key, rc);
    if (rc.t.length >= 3) {
      track({
        name: "feature_interaction",
        feature: "rage_click",
        metrics: { element: key, count: rc.t.length, path: location.pathname },
      });
      rc.t = [];
    }
    // Dead click: watch for no scroll / no path change / no dom mutation in 400ms
    const urlBefore = location.href;
    const scrollBefore = window.scrollY;
    let mutated = false;
    const obs = new MutationObserver(() => {
      mutated = true;
    });
    try {
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      obs.disconnect();
      if (!R) return;
      if (location.href === urlBefore && Math.abs(window.scrollY - scrollBefore) < 4 && !mutated) {
        R.dead.push({ t: now, el: key });
        track({
          name: "feature_interaction",
          feature: "dead_click",
          metrics: { element: key, path: location.pathname },
        });
      }
    }, 400);
    activityTick();
  };
  window.addEventListener("click", onClick, { passive: true, capture: true });

  // Hover — track duration on likely-interactive elements
  const isInteractive = (el: Element) =>
    /^(a|button|input|textarea|select|label)$/i.test(el.tagName) ||
    el.getAttribute("role") === "button" ||
    (el as HTMLElement).onclick !== null;
  const onOver = (e: MouseEvent) => {
    if (!R) return;
    const el = e.target as Element | null;
    if (el && isInteractive(el)) {
      R.hoverStarts.set(el, performance.now());
      R.hoverLastEl = el;
    }
  };
  const onOut = (e: MouseEvent) => {
    if (!R) return;
    const el = e.target as Element | null;
    if (el && R.hoverStarts.has(el)) {
      const start = R.hoverStarts.get(el)!;
      const d = performance.now() - start;
      R.hoverDurations.push(d);
      if (R.hoverDurations.length > 200) R.hoverDurations.shift();
      // Abandoned if hovered >250ms and no click within 500ms
      if (d > 250 && performance.now() - R.hoverLastClickedAt > 500) R.hoverWithoutClick += 1;
      R.hoverStarts.delete(el);
    }
  };
  window.addEventListener("mouseover", onOver, { passive: true });
  window.addEventListener("mouseout", onOut, { passive: true });

  // Visibility + online
  document.addEventListener("visibilitychange", () => {
    if (!R) return;
    if (document.visibilityState === "hidden") R.visibilityHides += 1;
  });
  window.addEventListener("online", () => {
    if (R) R.offlineTransitions += 1;
    if (R) R.wasOnline = true;
  });
  window.addEventListener("offline", () => {
    if (R) R.offlineTransitions += 1;
    if (R) R.wasOnline = false;
  });

  // Long tasks + CLS + LCP + INP via PerformanceObserver
  const safeObserve = (type: string, cb: (entry: PerformanceEntry) => void) => {
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) cb(e);
      });
      po.observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {
      /* not supported */
    }
  };
  safeObserve("longtask", () => R && (R.longTasks += 1));
  safeObserve("layout-shift", (e) => {
    const ls = e as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
    if (R && !ls.hadRecentInput && typeof ls.value === "number") R.cls += ls.value;
  });
  safeObserve("largest-contentful-paint", (e) => {
    if (R) R.lcpMs = Math.round(e.startTime);
  });
  safeObserve("event", (e) => {
    const ev = e as PerformanceEntry & { duration?: number };
    if (R && typeof ev.duration === "number" && ev.duration > (R.inpMs ?? 0))
      R.inpMs = Math.round(ev.duration);
  });

  // Flush on hide / unload
  const flushSummary = () => {
    if (!R || R.flushed) return;
    R.flushed = true;
    track({ name: "session_summary", metrics: snapshot() as unknown as Record<string, unknown> });
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSummary();
  });
  window.addEventListener("pagehide", flushSummary);
  window.addEventListener("beforeunload", flushSummary);
}

export function snapshot(): BehaviorMetrics {
  if (!R) return emptyMetrics();
  const sessionMs = performance.now() - R.started;
  const scrollAvgPct =
    R.scrollSamples.length > 0
      ? R.scrollSamples.reduce((a, b) => a + b, 0) / R.scrollSamples.length
      : 0;
  const sv = stats(R.scrollVelocities);
  const ms = stats(R.mouseSpeeds);
  const intervals: number[] = [];
  for (let i = 1; i < R.clickTimes.length; i++) intervals.push(R.clickTimes[i] - R.clickTimes[i - 1]);
  const ci = stats(intervals);
  const bursts = intervals.filter((x) => x < 200).length;
  const hv = stats(R.hoverDurations);
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
      rtt?: number;
      downlink?: number;
    };
    webdriver?: boolean;
    hardwareConcurrency?: number;
  };
  const perfMem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;

  // Reading mode heuristic
  let readingMode: BehaviorMetrics["readingMode"] = "unknown";
  const engagedMs = R.activeMs;
  if (R.scrollMax < 15 && engagedMs < 3_000) readingMode = "abandoning";
  else if (engagedMs > 20_000 && R.scrollPauseCount > 5 && R.scrollMax > 30) readingMode = "reading";
  else if (R.scrollVelocities.length > 10 && sv.mean > 1.5) readingMode = "scanning";
  else if (R.idleMs > engagedMs && R.idleMs > 15_000) readingMode = "idle";

  return {
    scrollMaxPct: Math.round(R.scrollMax),
    scrollAvgPct: Math.round(scrollAvgPct),
    scrollMilestones: R.milestones,
    scrollUpCount: R.scrollUp,
    scrollPauseCount: R.scrollPauses,
    scrollVelocityMean: Number(sv.mean.toFixed(3)),
    scrollVelocityStd: Number(sv.std.toFixed(3)),
    timeToFirstScrollMs: R.firstScrollAt !== null ? Math.round(R.firstScrollAt) : null,
    mouseMoves: R.mouseMoves,
    mouseSpeedMean: Number(ms.mean.toFixed(3)),
    mouseSpeedStd: Number(ms.std.toFixed(3)),
    mouseDirChanges: R.mouseDirChanges,
    mouseIdleRatio: sessionMs > 0 ? Number((R.idleMs / sessionMs).toFixed(3)) : 0,
    clickCount: R.clickTimes.length,
    clickIntervalMean: Math.round(ci.mean),
    clickIntervalStd: Math.round(ci.std),
    clickIntervalCV: Number(ci.cv.toFixed(3)),
    burstClicks: bursts,
    hoverCount: R.hoverDurations.length,
    hoverMeanMs: Math.round(hv.mean),
    hoverAbandonRate:
      R.hoverDurations.length > 0
        ? Number((R.hoverWithoutClick / R.hoverDurations.length).toFixed(3))
        : 0,
    idleMs: Math.round(R.idleMs),
    activeMs: Math.round(R.activeMs),
    longestActiveStreakMs: Math.round(R.longestActive),
    visibilityHides: R.visibilityHides,
    effectiveType: nav.connection?.effectiveType ?? null,
    saveData: nav.connection?.saveData ?? null,
    rtt: nav.connection?.rtt ?? null,
    downlink: nav.connection?.downlink ?? null,
    online: navigator.onLine,
    offlineTransitions: R.offlineTransitions,
    longTasks: R.longTasks,
    cls: Number(R.cls.toFixed(3)),
    lcpMs: R.lcpMs,
    inpMs: R.inpMs,
    memoryUsedMb: perfMem ? Math.round(perfMem.usedJSHeapSize / 1_048_576) : null,
    webdriver: nav.webdriver === true,
    hasTouch: (navigator.maxTouchPoints ?? 0) > 0,
    languages: navigator.languages?.length ?? 0,
    hardwareConcurrency: nav.hardwareConcurrency ?? 0,
    timezoneOffset: new Date().getTimezoneOffset(),
    readingMode,
    sessionMs: Math.round(sessionMs),
  };
}

function emptyMetrics(): BehaviorMetrics {
  return {
    scrollMaxPct: 0,
    scrollAvgPct: 0,
    scrollMilestones: { p10: false, p25: false, p50: false, p75: false, p90: false, p100: false },
    scrollUpCount: 0,
    scrollPauseCount: 0,
    scrollVelocityMean: 0,
    scrollVelocityStd: 0,
    timeToFirstScrollMs: null,
    mouseMoves: 0,
    mouseSpeedMean: 0,
    mouseSpeedStd: 0,
    mouseDirChanges: 0,
    mouseIdleRatio: 0,
    clickCount: 0,
    clickIntervalMean: 0,
    clickIntervalStd: 0,
    clickIntervalCV: 0,
    burstClicks: 0,
    hoverCount: 0,
    hoverMeanMs: 0,
    hoverAbandonRate: 0,
    idleMs: 0,
    activeMs: 0,
    longestActiveStreakMs: 0,
    visibilityHides: 0,
    effectiveType: null,
    saveData: null,
    rtt: null,
    downlink: null,
    online: true,
    offlineTransitions: 0,
    longTasks: 0,
    cls: 0,
    lcpMs: null,
    inpMs: null,
    memoryUsedMb: null,
    webdriver: false,
    hasTouch: false,
    languages: 0,
    hardwareConcurrency: 0,
    timezoneOffset: 0,
    readingMode: "unknown",
    sessionMs: 0,
  };
}

export function initBehavior() {
  if (typeof window === "undefined") return;
  try {
    initBehaviorInternal();
  } catch {
    /* telemetry must never break the app */
  }
}
