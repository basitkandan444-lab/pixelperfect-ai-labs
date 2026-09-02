import { useEffect, useRef, useState } from "react";

/**
 * Returns a ref and an object containing the relative mouse position
 * to a target element. Used for proximity-based interactions.
 */
export function useProximity() {
  const ref = useRef<HTMLDivElement>(null);
  const [proximity, setProximity] = useState({ x: 0, y: 0, distance: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const x = e.clientX - centerX;
      const y = e.clientY - centerY;
      const distance = Math.sqrt(x * x + y * y);

      setProximity({ x, y, distance });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return { ref, ...proximity };
}
