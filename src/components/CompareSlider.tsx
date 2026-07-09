import { useCallback, useRef, useState } from "react";

interface CompareSliderProps {
  before: string;
  after: string;
  className?: string;
}

export function CompareSlider({ before, after, className }: CompareSliderProps) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
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
      <img
        src={after}
        alt="Enhanced result"
        className="block w-full"
        draggable={false}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${pos}%` }}
      >
        <img
          src={before}
          alt="Original"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ width: containerRef.current?.clientWidth }}
          draggable={false}
        />
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-gradient-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
        After
      </span>

      <div
        className="absolute inset-y-0 z-10 w-0.5 bg-gradient-primary"
        style={{ left: `${pos}%` }}
      >
        <button
          type="button"
          aria-label="Drag to compare"
          onMouseDown={(e) => {
            e.preventDefault();
            dragging.current = true;
          }}
          onTouchStart={() => (dragging.current = true)}
          className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow transition-transform hover:scale-110"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
