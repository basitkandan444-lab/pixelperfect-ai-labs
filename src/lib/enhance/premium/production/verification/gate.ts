// Composable verification gate. Each check is a pure function returning a
// CheckResult. Consumers compose the checks that make sense for their pass
// (per-stage, per-run, per-release).

import type { CheckResult, VerificationReport } from "./report";
import { summarize } from "./report";

export type Check = () => CheckResult | Promise<CheckResult>;

export async function runGate(checks: Check[]): Promise<VerificationReport> {
  const results: CheckResult[] = [];
  for (const check of checks) {
    try {
      results.push(await check());
    } catch (err) {
      results.push({
        id: check.name || "anonymous",
        status: "fail",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return summarize(results);
}

/** Handy check factories. */
export const checks = {
  architecture(ok: boolean, note = ""): Check {
    return () => ({ id: "architecture", status: ok ? "pass" : "fail", message: note });
  },
  memory(usedMB: number, budgetMB: number): Check {
    return () => ({
      id: "memory",
      status: usedMB <= budgetMB ? "pass" : usedMB <= budgetMB * 1.25 ? "warn" : "fail",
      data: { usedMB, budgetMB },
    });
  },
  bundle(actualBytes: number, budgetBytes: number): Check {
    return () => ({
      id: "bundle",
      status: actualBytes <= budgetBytes ? "pass" : "fail",
      data: { actualBytes, budgetBytes },
    });
  },
  browser(available: ReadonlySet<string>, required: string[]): Check {
    return () => {
      const missing = required.filter((r) => !available.has(r));
      return {
        id: "browser",
        status: missing.length ? "warn" : "pass",
        data: { missing },
      };
    };
  },
};
