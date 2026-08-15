import { useCallback, useEffect, useRef, useState } from "react";

interface MagneticOptions {
  strength?: number;
  activeDistance?: number;
}

/**
 * Obsidian Precision™ Magnetic Hook
 * Attracts elements toward the pointer within proximity.
 */
export function useMagnetic({
  strength = 0.3,
  activeDistance = 100
}: MagneticOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < activeDistance) {
        // Direct state update for tactile response
        setPosition({ x: dx * strength, y: dy * strength });
      } else {
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [strength, activeDistance]);

  return { ref, position };
}
