import { describe, it, expect } from "vitest";
import { PADDLE_PLANS, isPaddlePlan, getPlanSpec, type PaddlePlanKey } from "./pricing-catalog";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Canonical Pricing Catalog Suite", () => {
  it("defines consistent catalog specifications for all plans", () => {
    const plans: PaddlePlanKey[] = ["monthly", "yearly", "lifetime"];

    for (const plan of plans) {
      const spec = getPlanSpec(plan);
      expect(spec).toBeDefined();
      expect(spec.id).toBe(plan);
      expect(spec.priceId).toMatch(/^pri_[a-z0-9]+$/);
      expect(spec.unitAmount).toBeGreaterThan(0);
      expect(spec.formattedPrice).toMatch(/^\$[0-9]+(\.[0-9]{2})?$/);
      expect(spec.features.length).toBeGreaterThan(3);
    }
  });

  it("validates isPaddlePlan type guard accurately", () => {
    expect(isPaddlePlan("monthly")).toBe(true);
    expect(isPaddlePlan("yearly")).toBe(true);
    expect(isPaddlePlan("lifetime")).toBe(true);
    expect(isPaddlePlan("weekly")).toBe(false);
    expect(isPaddlePlan("")).toBe(false);
    expect(isPaddlePlan(null)).toBe(false);
    expect(isPaddlePlan(undefined)).toBe(false);
  });

  it("ensures no active UI component contains stale pricing ($4.99 or $19.68)", () => {
    const srcDir = path.resolve(__dirname, "..");
    const filesToScan = [
      path.join(srcDir, "components", "HomeTopSections.tsx"),
      path.join(srcDir, "components", "UpgradeWall.tsx"),
      path.join(srcDir, "routes", "pricing.tsx"),
    ];

    for (const file of filesToScan) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, "utf8");
        expect(content).not.toContain("$4.99");
        expect(content).not.toContain("$19.68");
        expect(content).not.toContain("Monthly plan not in Stripe");
      }
    }
  });
});
