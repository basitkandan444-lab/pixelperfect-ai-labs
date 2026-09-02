import { Cloud } from "lucide-react";

export function FloatingAtmosphere() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden md:block"
      aria-hidden="true"
    >
      {/* Clouds - Large, slow, elegant */}
      <div className="absolute top-[10%] left-[-10%] opacity-20 animate-drift-slow">
        <Cloud className="h-64 w-64 text-surface-mid blur-xl" />
      </div>
      <div className="absolute top-[40%] right-[-5%] opacity-15 animate-drift-mid">
        <Cloud className="h-80 w-80 text-surface-mid blur-2xl" />
      </div>
      <div className="absolute bottom-[15%] left-[5%] opacity-10 animate-drift-fast">
        <Cloud className="h-48 w-48 text-primary/20 blur-xl" />
      </div>

      {/* Floating 4K images uploaded text - "Flying in the sky" */}
      <div className="absolute top-[20%] right-[15%] animate-float-delayed">
        <div className="relative">
          <div className="absolute -inset-4 bg-primary/5 blur-xl rounded-full" />
          <div className="glass px-4 py-2 rounded-full border-primary/20 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="eyebrow !text-[10px] text-primary tracking-[0.2em] whitespace-nowrap">
              [ 4K IMAGES UPLOADED ]
            </span>
          </div>
        </div>
      </div>

      {/* Another one for depth */}
      <div className="absolute bottom-[30%] left-[20%] animate-float opacity-40 scale-75">
        <div className="glass px-3 py-1.5 rounded-full border-white/5 flex items-center gap-2">
          <span className="eyebrow !text-[8px] text-muted-foreground tracking-[0.2em] whitespace-nowrap">
            SECURE INFRASTRUCTURE
          </span>
        </div>
      </div>
    </div>
  );
}
