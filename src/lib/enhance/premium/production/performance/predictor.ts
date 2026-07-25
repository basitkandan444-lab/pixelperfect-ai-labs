// EMA-based cost predictor. Learns per-stage ms/MP over time so the advisor
// can trim stages that would blow the budget on the current device.

export class CostPredictor {
  private ema = new Map<string, number>();
  private alpha: number;
  constructor(alpha = 0.3) { this.alpha = alpha; }

  observe(stageId: string, ms: number, megapixels: number): void {
    if (megapixels <= 0) return;
    const perMP = ms / megapixels;
    const prev = this.ema.get(stageId);
    this.ema.set(stageId, prev === undefined ? perMP : prev * (1 - this.alpha) + perMP * this.alpha);
  }
  msPerMP(stageId: string): number | undefined { return this.ema.get(stageId); }
  predict(stageId: string, megapixels: number): number | undefined {
    const v = this.ema.get(stageId);
    return v === undefined ? undefined : v * megapixels;
  }
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.ema.entries());
  }
}
