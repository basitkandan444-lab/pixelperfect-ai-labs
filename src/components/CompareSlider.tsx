import { useCallback, useEffect, useRef, useState } from "react";

interface ResponsiveImage {
  /** Fallback URL (JPEG/PNG) also used as the <img src>. */
  src: string;
  /** Optional base path without extension, e.g. "/gallery/landscape-before". */
  base?: string;
  /** Widths available at `${base}-${w}.avif` / `.webp`. */
  widths?: number[];
  /** Intrinsic width/height, e.g. 900x675. Set both to zero-out CLS. */
  width?: number;
  height?: number;
}

interface CompareSliderProps {
  /** Backwards-compatible string src or a full responsive descriptor. */
  before: string | ResponsiveImage;
  after: string | ResponsiveImage;
  afterAlt?: string;
  beforeAlt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** <picture> sizes attribute, defaults to a two-column responsive layout. */
  sizes?: string;
  /** Preload hint for the very first slider on the page. */
  fetchPriority?: "high" | "low" | "auto";
}

function toImg(v: string | ResponsiveImage): ResponsiveImage {
  return typeof v === "string" ? { src: v } : v;
}

function Picture({
  img,
  alt,
  className,
  style,
  draggable,
  loading,
  fetchPriority,
  sizes,
}: {
  img: ResponsiveImage;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  draggable?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  sizes?: string;
}) {
  const widths = img.widths ?? [];
  const base = img.base;
  const buildSrcSet = (ext: string) => widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(", ");
  return (
    <picture>
      {base && widths.length > 0 && (
        <>
          <source type="image/avif" srcSet={buildSrcSet("avif")} sizes={sizes} />
          <source type="image/webp" srcSet={buildSrcSet("webp")} sizes={sizes} />
        </>
      )}
      <img
        src={img.src}
        alt={alt}
        width={img.width}
        height={img.height}
        className={className}
        style={style}
        draggable={draggable}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
      />
    </picture>
  );
}

export function CompareSlider({
  before,
  after,
  afterAlt,
  beforeAlt,
  className,
  loading = "eager",
  sizes = "(min-width: 1024px) 45vw, (min-width: 640px) 90vw, 100vw",
  fetchPriority,
}: CompareSliderProps) {
  const beforeImg = toImg(before);
  const afterImg = toImg(after);

  const [pos, setPos] = useState(50);
  const [springPos, setSpringPos] = useState(50);
  const [handleScale, setHandleScale] = useState(1);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Inertia / Spring effect for the handle
  useEffect(() => {
    let frame: number;
    const tick = () => {
      setSpringPos(prev => {
        const diff = pos - prev;
        if (Math.abs(diff) < 0.001) return pos;
        return prev + diff * 0.12; // Adjusted for measured resistance
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pos]);

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
      className={`group relative w-full select-none overflow-hidden rounded-lg border border-border bg-surface-low shadow-elevated transition-all duration-slow ease-expo-out hover:scale-[1.002] hover:shadow-cinema ${className ?? ""}`}
      onMouseMove={(e) => dragging.current && updateFromClientX(e.clientX)}
      onMouseUp={() => { dragging.current = false; setHandleScale(1); }}
      onMouseLeave={() => { dragging.current = false; setHandleScale(1); }}
      onTouchMove={(e) => updateFromClientX(e.touches[0].clientX)}
    >
      <Picture
        img={afterImg}
        alt={afterAlt ?? "Enhanced high-resolution result"}
        className="block h-auto w-full transition-transform duration-1000 group-hover:scale-[1.03]"
        draggable={false}
        loading={loading}
        fetchPriority={fetchPriority}
        sizes={sizes}
      />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${springPos}%` }}>
        <Picture
          img={beforeImg}
          alt={beforeAlt ?? "Original low-quality image"}
          className="absolute inset-0 h-full max-w-none object-cover transition-transform duration-1000 group-hover:scale-[1.03]"
          style={{ width: width || "100%" }}
          draggable={false}
          loading={loading}
          sizes={sizes}
        />
      </div>

      <span className="pointer-events-none absolute left-4 top-4 rounded-md border border-border bg-background/80 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground backdrop-blur-xl transition-transform duration-standard group-hover:translate-x-0.5 shadow-subtle">
        Original
      </span>
      <span className="pointer-events-none absolute right-4 top-4 rounded-md bg-primary px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-primary-foreground backdrop-blur-sm shadow-glow transition-transform duration-standard group-hover:-translate-x-0.5">
        Enhanced
      </span>


      <div
        className="absolute inset-y-0 z-10 w-px bg-primary"
        style={{ left: `${springPos}%` }}
      >
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
            setHandleScale(0.95);
          }}
          onTouchStart={() => {
            dragging.current = true;
            setHandleScale(0.95);
          }}
          className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-foreground text-background shadow-elevated transition-all duration-standard hover:scale-110 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-border z-20"
          style={{ transform: `translate3d(-50%, -50%, 0) scale(${handleScale})` }}
          onMouseEnter={() => setHandleScale(1.15)}
          onMouseLeave={() => !dragging.current && setHandleScale(1)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
