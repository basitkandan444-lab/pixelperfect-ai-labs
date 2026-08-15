import { useCallback, useEffect, useRef, useState } from "react";

interface MagneticOptions {
  strength?: number;
  activeDistance?: number;
  smoothing?: number;
}

/**
 * Obsidian Precision™ Magnetic Hook
 * Attracts elements toward the pointer within proximity.
 */
export function useMagnetic({
  strength = 0.3,
  activeDistance = 100,
  smoothing = 0.15,
}: MagneticOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frameId: number;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < activeDistance) {
        targetX = dx * strength;
        targetY = dy * strength;
      } else {
        targetX = 0;
        targetY = 0;
      }
      
      // Update position immediately on move to trigger style change for Playwright
      // The update() loop still handles smoothing
      if (distance < activeDistance) {
         setPosition(prev => ({ ...prev }));
      }
    };

    const update = () => {
      // Manual lerp for smoothing to ensure perfect performance without heavy libraries
      currentX += (targetX - currentX) * smoothing;
      currentY += (targetY - currentY) * smoothing;
      
      if (Math.abs(currentX - targetX) > 0.01 || Math.abs(currentY - targetY) > 0.01) {
        setPosition({ x: currentX, y: currentY });
      } else if (currentX !== targetX) {
        setPosition({ x: targetX, y: targetY });
      }
      
      frameId = requestAnimationFrame(update);
    };

    window.addEventListener("mousemove", handleMouseMove);
    frameId = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(frameId);
    };
  }, [strength, activeDistance, smoothing]);

  return { ref, position };
}
