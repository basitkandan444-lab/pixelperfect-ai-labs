// Pre-enhancement "AI Analysis Card" — the premium, desktop-app-style summary
// that appears once an image is loaded and before the user presses Enhance. It
// surfaces every signal the prediction engine used, so the wait feels informed
// and intentional rather than open-ended.

import {
  Maximize2,
  Grid2x2,
  FileImage,
  Cpu,
  Gauge,
  BrainCircuit,
  Clock,
  Target,
} from "lucide-react";

import { formatEta } from "@/lib/enhance/estimate";
import { confidencePercent, type Prediction } from "@/lib/enhance/predictor";

type Tier = "high" | "medium" | "low";

export interface AnalysisCardProps {
  prediction: Prediction;
  width: number;
  height: number;
  format: string | null;
  engine: "classical" | "neural";
  scale: "4k" | "8k";
  tier: Tier;
  accelLabel: string;
  neuralAvailable: boolean;
  neuralWarm: boolean;
}

const TIER_LABEL: Record<Tier, string> = {
  high: "High performance",
  medium: "Balanced",
  low: "Power saver",
};

function formatType(format: string | null): string {
  if (!format) return "Image";
  const t = format.toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return "JPEG";
  if (t.includes("png")) return "PNG";
  if (t.includes("webp")) return "WebP";
  if (t.includes("/")) return t.split("/")[1].toUpperCase();
  return t.toUpperCase();
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}

function Stat({ icon, label, value, hint, accent }: StatProps) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-2xl border p-3.5 transition-colors ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </span>
      <span className="font-display text-base font-bold leading-tight tabular-nums">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function AnalysisCard({
  prediction,
  width,
  height,
  format,
  engine,
  scale,
  tier,
  accelLabel,
  neuralAvailable,
  neuralWarm,
}: AnalysisCardProps) {
  const isNeural = engine === "neural";
  const mode = isNeural ? "Neural AI" : "Fast (Classical)";
  const neuralStatus = !neuralAvailable
    ? "Not available"
    : neuralWarm
      ? "Ready"
      : "Warming up…";
  const accuracy = confidencePercent(prediction.confidence);

  return (
    <div
      className="animate-fade-up rounded-2xl border border-border glass p-4 sm:p-5"
      aria-label="AI analysis of your image"
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-sm font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
            <BrainCircuit className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
          </span>
          AI Analysis
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          {accuracy}% prediction accuracy
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          icon={<Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Resolution"
          value={`${width.toLocaleString()}×${height.toLocaleString()}`}
          hint={`→ ${scale.toUpperCase()} output`}
        />
        <Stat
          icon={<Grid2x2 className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Megapixels"
          value={`${prediction.megapixels.toFixed(1)} MP`}
          hint={
            isNeural && prediction.tiles > 0
              ? `${prediction.tiles} neural ${prediction.tiles === 1 ? "tile" : "tiles"}`
              : `${prediction.outputMegapixels.toFixed(1)} MP out`
          }
        />
        <Stat
          icon={<FileImage className="h-3.5 w-3.5" aria-hidden="true" />}
          label="File type"
          value={formatType(format)}
        />
        <Stat
          icon={<Cpu className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Processing mode"
          value={mode}
          hint={accelLabel}
        />
        <Stat
          icon={<Gauge className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Device tier"
          value={TIER_LABEL[tier]}
        />
        <Stat
          icon={<BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Neural engine"
          value={neuralStatus}
          accent={isNeural && neuralWarm}
        />
        <Stat
          icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Estimated time"
          value={formatEta(prediction.estimateMs).replace("about ", "~")}
          accent
        />
        <Stat
          icon={<Target className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Confidence"
          value={`${accuracy}%`}
          hint={prediction.tiles > 0 || !isNeural ? "self-calibrating" : undefined}
        />
      </div>
    </div>
  );
}
