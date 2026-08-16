import React, { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";

export function GravityAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Calculate parallax and "gravity" rotation based on scroll
  const rotation = scrollY * 0.1;
  const translateY = Math.sin(scrollY * 0.005) * 20;
  const perspective = 1000;

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-[400px] flex items-center justify-center overflow-hidden my-24 reveal"
    >
      {/* Background depth elements */}
      <div className="absolute inset-0 grid-noise opacity-20" />
      
      <div 
        className="gravity-3d relative"
        style={{
          transform: `perspective(${perspective}px) rotateY(${rotation}deg) translateY(${translateY}px) rotateX(${rotation * 0.5}deg)`,
        }}
      >
        {/* The "Another 3D animation" text with floating "gravity" effect */}
        <div className="relative group">
          {/* Inner glow */}
          <div className="absolute -inset-10 bg-primary/20 blur-[80px] rounded-full opacity-50 animate-glow-pulse" />
          
          <div className="relative glass p-12 rounded-2xl border-primary/30 shadow-modal backdrop-blur-3xl transition-all duration-slow group-hover:border-primary/60 group-hover:shadow-glow">
            <div className="space-y-4 text-center">
              <div className="flex justify-center mb-6">
                <Box className="h-12 w-12 text-primary animate-bounce shadow-glow rounded-lg p-2 bg-surface-mid" />
              </div>
              <h3 className="text-display !text-4xl md:!text-6xl text-foreground tracking-tighter">
                UNBOUND <br />
                <span className="text-primary text-shimmer">GRAVITY</span>
              </h3>
              <p className="eyebrow !text-[10px] text-muted-foreground tracking-[0.3em] mt-4">
                NEURAL ARCHITECTURE V.04
              </p>
            </div>
          </div>

          {/* Floating satellites */}
          <div className="absolute -top-10 -right-10 glass p-3 rounded-lg border-primary/20 animate-float-delayed">
             <span className="eyebrow !text-[8px] text-primary">SCALE: 8K</span>
          </div>
          <div className="absolute -bottom-12 -left-8 glass p-3 rounded-lg border-primary/20 animate-float" style={{ animationDelay: '1s' }}>
             <span className="eyebrow !text-[8px] text-primary">PRIVATE</span>
          </div>
        </div>
      </div>

      {/* Ambient particles */}
      {[...Array(6)].map((_, i) => (
        <div 
          key={i}
          className="absolute h-1 w-1 bg-primary/40 rounded-full blur-[1px]"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            transform: `translateZ(${Math.random() * 100}px)`,
            animation: `float ${10 + Math.random() * 10}s infinite ease-in-out`,
            animationDelay: `${Math.random() * 5}s`
          }}
        />
      ))}
    </div>
  );
}
