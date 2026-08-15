// Premium live-processing overlay — replaces the plain spinner during an
// enhancement. Shows a large animated ETA countdown, a smooth progress bar and
// a five-stage pipeline tracker (Preparing → AI Analysis → Neural Enhancement →
// Blending → Finalizing). The ETA is driven by the self-adjusting predictor so
// it stays honest and never expires early.

import { Wand2, Check, Loader2 } from "lucide-react";

import { formatRemaining } from "@/lib/enhance/estimate";
import { PROCESSING_STAGES, stageIndex, type ProcessingStage } from "@/lib/enhance/predictor";

export interface ProcessingOverlayProps {
  scale: "4k" | "8k";
  /** Raw pipeline progress, 0..100. */
  progress: number;
  statusMessage: string;
  etaRemainingMs: number;
  stage: ProcessingStage;
  accuracy: number;
  onCancel: () => void;
}

export function ProcessingOverlay({
  scale,
  progress,
  statusMessage,
  etaRemainingMs,
  stage,
  accuracy,
  onCancel,
}: ProcessingOverlayProps) {
  const activeIndex = stageIndex(stage);
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface-low/98 px-6 backdrop-blur-xl animate-hero-in"
      role="status"
      aria-live="polite"
    >
      <div className="shimmer absolute inset-0 h-full w-full" aria-hidden="true" />

      <div className="relative flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-surface-mid shadow-elevated">
        <Wand2 className="h-7 w-7 animate-pulse text-primary" aria-hidden="true" />
      </div>

      <p className="relative eyebrow !text-[11px] !text-muted-foreground mt-2">
        Enhancing to {scale.toUpperCase()}
      </p>

      {/* Big animated ETA countdown */}
      <div
        className="relative flex flex-col items-center gap-0.5"
        data-testid="eta-countdown"
        aria-live="polite"
      >
        <span className="text-display !text-4xl tabular-nums">
          {formatRemaining(etaRemainingMs)}
        </span>
        <span className="eyebrow !text-[10px]">Processing Pipeline Active</span>
      </div>

      {/* Smooth progress bar */}
      <div
        className="relative h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-mid"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Enhancement progress"
      >
        <div
          className="h-full rounded-full bg-primary shadow-[0_0_12px_oklch(0.65_0.2_250_/_0.4)] transition-[width] duration-700 ease-expo-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stage tracker */}
      <ol className="relative flex w-full max-w-sm items-center justify-between">
        {PROCESSING_STAGES.map((s, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={s.id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] transition-colors ${
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface-mid text-muted-foreground"
                }`}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={`text-center text-[10px] leading-tight ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="relative text-sm text-muted-foreground">{statusMessage}</p>

      <button
        type="button"
        onClick={onCancel}
        className="relative mt-2 rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Cancel
      </button>
    </div>
  );
}
