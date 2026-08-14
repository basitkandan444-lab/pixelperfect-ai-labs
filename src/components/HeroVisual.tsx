import { CompareSlider } from "@/components/CompareSlider";
import { Sparkles, UploadCloud, Gauge, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function HeroVisual() {
  return (
    <div className="relative mx-auto max-w-5xl mt-12 sm:mt-16 group/hero">
      {/* 3D Perspective Container */}
      <div className="relative animate-tilt transition-all duration-1000 group-hover/hero:animate-none group-hover/hero:scale-[1.01]">
        {/* Glow Layer */}
        <div className="absolute -inset-10 bg-primary/10 blur-[80px] opacity-40 group-hover/hero:opacity-60 transition-opacity" />
        
        {/* Main Frame */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[oklch(0.1_0.01_250)] shadow-cinema backdrop-blur-3xl">
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
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none opacity-0 group-hover/hero:opacity-100 transition-opacity duration-500">
                <div className="px-4 py-2 rounded-full bg-black/60 border border-white/10 backdrop-blur-md text-[10px] font-bold uppercase tracking-widest text-white flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Drag to compare results
                </div>
              </div>
            </div>

            {/* Right: The CTA / Entry Point */}
            <div className="lg:col-span-4 p-8 lg:p-10 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-white/10 bg-white/[0.02]">
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Neural Engine v2.4</span>
                </div>
                
                <h3 className="font-display text-3xl font-bold tracking-tight text-white">
                  Ready to transform your images?
                </h3>
                
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Experience elite 8K upscaling. Every pixel is processed locally on your GPU for absolute privacy.
                </p>

                <div className="pt-4 flex flex-col gap-3">
                  <a 
                    href="#workspace" 
                    className="sheen relative flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Start Enhancing
                  </a>
                  
                  <Link 
                    to="/pricing"
                    className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-white/[0.1] hover:border-white/20"
                  >
                    <Gauge className="h-4 w-4 opacity-70" />
                    Go Premium
                    <ArrowRight className="h-3 w-3 opacity-50" />
                  </Link>
                </div>

                <div className="pt-8 border-t border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-8 w-8 rounded-full border-2 border-[oklch(0.06_0_0)] bg-white/10" />
                      ))}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
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
