import { useState, useEffect } from "react";
import { CompareSlider } from "@/components/CompareSlider";
import { Sparkles, UploadCloud, Gauge, ArrowRight, MousePointer2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const HERO_IMAGES = [
  { id: 1, label: "Landscape", slug: "h1" },
  { id: 2, label: "Restoration", slug: "h2" },
  { id: 3, label: "Product", slug: "h3" },
];

export function HeroVisual() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  return (
    <div className="relative mx-auto max-w-6xl mt-12 sm:mt-16 group/hero px-4">
      {/* 3D Elite Container */}
      <div 
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setMousePos({ x: 0, y: 0 })}
        style={{
          transform: `perspective(1200px) rotateY(${mousePos.x * 4}deg) rotateX(${mousePos.y * -4}deg)`,
          transition: "transform 0.2s cubic-bezier(0.23, 1, 0.32, 1)"
        }}
        className="relative z-10"
      >
        {/* Cinematic Ambient Glow */}
        <div className="absolute -inset-20 bg-primary/15 blur-[120px] opacity-40 group-hover/hero:opacity-70 transition-opacity duration-1000" />
        
        <div className="relative overflow-hidden rounded-[3rem] border border-white/10 bg-[oklch(0.06_0_0)] shadow-cinema backdrop-blur-3xl">
          {/* Animated Scan Line */}
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-scan pointer-events-none z-30" />
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
            {/* Left: Multi-Image Elite Showcase */}
            <div className="lg:col-span-8 relative min-h-[400px] lg:min-h-[600px] bg-black">
              {HERO_IMAGES.map((img, idx) => (
                <div 
                  key={img.id}
                  className={cn(
                    "absolute inset-0 transition-all duration-1000 ease-spring",
                    activeIndex === idx ? "opacity-100 scale-100 pointer-events-auto z-20" : "opacity-0 scale-95 pointer-events-none z-10"
                  )}
                >
                  <CompareSlider
                    before={{
                      src: `/hero/${img.slug}-before.jpg`,
                      base: `/hero/${img.slug}-before`,
                      widths: [600, 900],
                      width: 900,
                      height: 600,
                    }}
                    after={{
                      src: `/hero/${img.slug}-after.jpg`,
                      base: `/hero/${img.slug}-after`,
                      widths: [600, 900],
                      width: 900,
                      height: 600,
                    }}
                    className="h-full w-full !rounded-none border-none shadow-none object-cover"
                  />
                </div>
              ))}

              {/* Multi-Image Navigation Dots */}
              <div className="absolute bottom-8 left-8 z-30 flex items-center gap-3">
                {HERO_IMAGES.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveIndex(idx)}
                    className={cn(
                      "h-1.5 transition-all duration-500 rounded-full",
                      activeIndex === idx ? "w-8 bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.5)]" : "w-1.5 bg-white/20 hover:bg-white/40"
                    )}
                    aria-label={`Switch to image ${idx + 1}`}
                  />
                ))}
              </div>

              {/* Interaction Callout */}
              <div className="absolute top-8 right-8 z-30 pointer-events-none">
                <div className="glass px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-white/80 flex items-center gap-2">
                  <MousePointer2 className="h-3 w-3 text-primary animate-pulse" />
                  Elite Multi-Stage Preview
                </div>
              </div>
            </div>

            {/* Right: The Engine Control Center */}
            <div className="lg:col-span-4 p-8 lg:p-12 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-white/10 bg-white/[0.01]">
              <div className="space-y-8">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute -inset-2 bg-primary/20 blur-md rounded-full animate-pulse" />
                    <Sparkles className="h-6 w-6 text-primary relative z-10" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-[0.3em] text-white/60">
                    Engine Status: Active
                  </span>
                </div>
                
                <h3 className="font-display text-4xl font-bold tracking-tight text-white leading-[1.1]">
                  Zero Upload. <br />
                  <span className="text-shimmer">Infinite Precision.</span>
                </h3>
                
                <p className="text-base leading-relaxed text-muted-foreground/80">
                  Real-ESRGAN running locally on your hardware. No queue, no cloud latency, no compromise.
                </p>

                <div className="space-y-4">
                  <a 
                    href="#workspace" 
                    className="sheen relative flex items-center justify-center gap-3 rounded-2xl bg-primary px-8 py-5 text-sm font-bold text-white shadow-glow transition-all hover:scale-[1.02] active:scale-[0.98] group/btn"
                  >
                    <UploadCloud className="h-5 w-5 transition-transform group-hover/btn:-translate-y-1" />
                    Launch Engine
                  </a>
                  
                  <Link 
                    to="/pricing"
                    className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-5 text-sm font-semibold text-white transition-all hover:bg-white/[0.08] hover:border-white/20 group/link"
                  >
                    <Gauge className="h-5 w-5 opacity-70 transition-transform group-hover/link:rotate-12" />
                    Unlock Premium
                    <ArrowRight className="h-4 w-4 opacity-50 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                </div>

                <div className="pt-10 border-t border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div 
                          key={i} 
                          className="h-10 w-10 rounded-full border-2 border-[oklch(0.06_0_0)] bg-surface-high overflow-hidden relative group/avatar"
                        >
                           <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent group-hover/avatar:opacity-0 transition-opacity" />
                           <div className="w-full h-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                             {['B', 'A', 'S', 'N'][i-1]}
                           </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-white/90">
                        3k+ Images Processed
                      </span>
                      <span className="text-[9px] text-muted-foreground/60 italic mt-0.5">
                        (We build real tech, not fake trust counters)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
