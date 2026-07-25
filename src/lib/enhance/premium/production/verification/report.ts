// Structured verification report shared by the gate and dev telemetry.

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  status: CheckStatus;
  message?: string;
  data?: Record<string, unknown>;
}

export interface VerificationReport {
  score: number; // 0..100
  status: CheckStatus;
  checks: CheckResult[];
}

export function summarize(checks: CheckResult[]): VerificationReport {
  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const total = checks.length || 1;
  const score = Math.round(((total - failed - warned * 0.5) / total) * 100);
  const status: CheckStatus = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";
  return { score, status, checks };
}
