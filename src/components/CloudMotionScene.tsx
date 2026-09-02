import { useEffect, useRef } from "react";

const cloudLayers = [
  { className: "cloud-form cloud-form-near", depth: 1 },
  { className: "cloud-form cloud-form-mid", depth: 0.58 },
  { className: "cloud-form cloud-form-far", depth: 0.3 },
] as const;

const motes = [
  { left: "11%", top: "31%", delay: "-1s" },
  { left: "24%", top: "68%", delay: "-4s" },
  { left: "42%", top: "23%", delay: "-2s" },
  { left: "63%", top: "72%", delay: "-6s" },
  { left: "78%", top: "28%", delay: "-3s" },
  { left: "91%", top: "58%", delay: "-5s" },
] as const;

export function CloudMotionScene() {
  const sceneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const writePosition = (x: number, y: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        scene.style.setProperty("--cloud-x", `${x.toFixed(2)}px`);
        scene.style.setProperty("--cloud-y", `${y.toFixed(2)}px`);
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches || event.pointerType === "touch") return;
      const bounds = scene.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 14;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 8;
      writePosition(x, y);
    };

    const settle = () => writePosition(0, 0);

    scene.addEventListener("pointermove", handlePointerMove, { passive: true });
    scene.addEventListener("pointerleave", settle);

    return () => {
      cancelAnimationFrame(frame);
      scene.removeEventListener("pointermove", handlePointerMove);
      scene.removeEventListener("pointerleave", settle);
    };
  }, []);

  return (
    <section
      ref={sceneRef}
      className="cloud-scene reveal"
      data-testid="cloud-motion-scene"
      aria-hidden="true"
    >
      <div className="cloud-horizon" />
      <div className="cloud-current cloud-current-one" />
      <div className="cloud-current cloud-current-two" />

      {cloudLayers.map((layer) => (
        <div
          key={layer.className}
          className={layer.className}
          style={{ "--cloud-depth": layer.depth } as React.CSSProperties}
        >
          <span />
          <span />
          <span />
        </div>
      ))}

      <div className="cloud-orbit">
        <div className="cloud-core">
          <span />
          <span />
          <span />
        </div>
      </div>

      {motes.map((mote) => (
        <i
          key={`${mote.left}-${mote.top}`}
          className="cloud-mote"
          style={{ left: mote.left, top: mote.top, animationDelay: mote.delay }}
        />
      ))}
    </section>
  );
}