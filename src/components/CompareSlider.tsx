import { useCallback, useEffect, useRef, useState } from "react";

interface CompareSliderProps {
  before: string;
  after: string;
  afterAlt?: string;
  beforeAlt?: string;
  className?: string;
  loading?: "lazy" | "eager";
}

export function CompareSlider({
  before,
  after,
  afterAlt,
  beforeAlt,
  className,
  loading = "eager",
}: CompareSliderProps) {
  const [pos, setPos] = useState(50);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPos((p) => Math.max(0, p - 4));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPos((p) => Math.min(100, p + 4));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPos(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setPos(100);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`group relative w-full select-none overflow-hidden rounded-2xl border border-border ${className ?? ""}`}
      onMouseMove={(e) => dragging.current && updateFromClientX(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchMove={(e) => updateFromClientX(e.touches[0].clientX)}
    >
      <img src={after} alt={afterAlt ?? "Enhanced high-resolution result"} className="block w-full" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <img
          src={before}
          alt="Original low-quality image"
          className="absolute inset-0 h-full max-w-none object-cover"
          style={{ width: width || "100%" }}
          draggable={false}
        />
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-gradient-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
        After
      </span>

      <div className="absolute inset-y-0 z-10 w-0.5 bg-gradient-primary" style={{ left: `${pos}%` }}>
        <button
          type="button"
          role="slider"
          aria-label="Comparison slider — use arrow keys to compare before and after"
          aria-valuenow={Math.round(pos)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseDown={(e) => {
            e.preventDefault();
            dragging.current = true;
          }}
          onTouchStart={() => (dragging.current = true)}
          className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
