import { CompareSlider } from "@/components/CompareSlider";
import { Sparkles, UploadCloud, Gauge, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { useProximity } from "@/hooks/use-proximity";

export function HeroVisual() {
  const { ref, x, y, distance } = useProximity();
  
  // Only apply magnetic tilt if within range (e.g. 600px)
  const isNear = distance < 600;
  const tiltX = isNear ? (y / 600) * -10 : 0;
  const tiltY = isNear ? (x / 600) * 10 : 0;

  return (
    <div 
      ref={ref}
      className="relative mx-auto max-w-5xl mt-12 sm:mt-16 group/hero px-4 sm:px-0"
    >
      {/* 3D Perspective Container - subtle on mobile, interactive on desktop */}
      <div 
        className="relative transition-all duration-standard ease-precision group-hover/hero:scale-[1.01] touch-none sm:touch-auto"
        style={{
          transform: `perspective(1200px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
          willChange: "transform"
        }}
      >
        {/* Glow Layer */}
        <div 
          className="absolute -inset-10 bg-primary/5 blur-[100px] opacity-30 group-hover/hero:opacity-50 transition-opacity" 
          style={{
            transform: `translate3d(${tiltY * 2}px, ${tiltX * 2}px, 0)`,
          }}
        />
        
        {/* Main Frame */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-surface-low shadow-modal backdrop-blur-3xl">
          {/* Subtle Scan Line */}
          <div className="absolute inset-x-0 h-40 bg-gradient-to-b from-transparent via-primary/10 to-transparent animate-scan pointer-events-none z-20" />

          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
            {/* Left: The Visual Comparison */}
            <div className="lg:col-span-8 relative">
              <CompareSlider
                before={{
                  src: "/gallery/landscape-before.jpg",
                  base: "/gallery/landscape-before",
                  widths: [600, 900],
                  width: 900,
                  height: 600,
                }}
                after={{
                  src: "/gallery/landscape-after.jpg",
                  base: "/gallery/landscape-after",
                  widths: [600, 900],
                  width: 900,
                  height: 600,
                }}
                className="!rounded-none border-none shadow-none"
              />
              
              {/* Interaction Hint */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none opacity-100 lg:opacity-0 group-hover/hero:opacity-100 transition-opacity duration-standard">
                <div className="px-3 py-1.5 rounded-md bg-background/80 border border-primary/30 backdrop-blur-md text-[9px] font-bold uppercase tracking-widest text-foreground flex items-center gap-2 shadow-glow">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Drag to compare
                </div>
              </div>
            </div>

            {/* Right: The CTA / Entry Point */}
            <div className="lg:col-span-4 p-8 lg:p-10 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-border bg-surface-mid/50">
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="eyebrow !text-[9px]">Neural Engine v2.4</span>
                </div>
                
                <h3 className="text-display !text-3xl">
                  Ready to transform your images?
                </h3>
                
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Experience elite 8K upscaling. Every pixel is processed locally on your GPU for absolute privacy.
                </p>

                <div className="pt-4 flex flex-col gap-3">
                  <a 
                    href="#workspace" 
                    className="relative flex items-center justify-center gap-2 rounded-md bg-foreground px-6 py-4 text-sm font-bold text-background shadow-elevated transition-all duration-standard hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Start Enhancing
                  </a>
                  
                  <Link 
                    to="/pricing"
                    className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface-low px-6 py-4 text-sm font-semibold text-foreground transition-all duration-standard hover:bg-surface-mid hover:border-foreground/20"
                  >
                    <Gauge className="h-4 w-4 opacity-70" />
                    Go Premium
                    <ArrowRight className="h-3 w-3 opacity-50" />
                  </Link>
                </div>

                <div className="pt-8 border-t border-border">
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-8 w-8 rounded-full border-2 border-surface-low bg-surface-mid" />
                      ))}
                    </div>
                    <span className="eyebrow !text-[9px]">
                      3k+ images processed
                    </span>

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
