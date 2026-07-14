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
  const buildSrcSet = (ext: string) =>
    widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(", ");
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
      <Picture
        img={afterImg}
        alt={afterAlt ?? "Enhanced high-resolution result"}
        className="block h-auto w-full"
        draggable={false}
        loading={loading}
        fetchPriority={fetchPriority}
        sizes={sizes}
      />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <Picture
          img={beforeImg}
          alt={beforeAlt ?? "Original low-quality image"}
          className="absolute inset-0 h-full max-w-none object-cover"
          style={{ width: width || "100%" }}
          draggable={false}
          loading={loading}
          sizes={sizes}
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
          className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
