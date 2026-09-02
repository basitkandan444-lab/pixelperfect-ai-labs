import { useEffect, useRef, useState } from "react";

interface CountUpStatProps {
  /** Final numeric value, e.g. 4.4 */
  value: number;
  /** Decimal places to render */
  decimals?: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  className?: string;
}

/**
 * Obsidian Precision™ animated stat.
 * Counts up once the element enters the viewport, using an expo-out curve.
 * Respects prefers-reduced-motion by rendering the final value immediately.
 */
export function CountUpStat({
  value,
  decimals = 1,
  suffix = "",
  prefix = "",
  durationMs = 1600,
  className,
}: CountUpStatProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setDisplay(value);
      return;
    }

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / durationMs, 1);
        // ease-expo-out
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setDisplay(value * eased);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            run();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
