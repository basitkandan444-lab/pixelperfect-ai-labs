import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetRegistryForTests,
  registerCapability,
  getCapability,
  listCapabilities,
  capabilitiesFor,
  freezeRegistry,
} from "./registry";
import type { FeatureFlag } from "./types";

beforeEach(() => __resetRegistryForTests());

describe("capability registry", () => {
  it("registers and retrieves", () => {
    registerCapability({
      id: "x", version: "1", label: "X", requires: [], weight: 0.1,
      budget: { memMBPerMP: 1, timeMsPerMP: 1 },
    });
    expect(getCapability("x")?.id).toBe("x");
    expect(listCapabilities()).toHaveLength(1);
  });

  it("gates by required features", () => {
    registerCapability({
      id: "gpu", version: "1", label: "GPU", requires: ["webgpu"], weight: 0.1,
      budget: { memMBPerMP: 1, timeMsPerMP: 1 },
    });
    registerCapability({
      id: "cpu", version: "1", label: "CPU", requires: ["canvas2d"], weight: 0.1,
      budget: { memMBPerMP: 1, timeMsPerMP: 1 },
    });
    const avail = new Set<FeatureFlag>(["canvas2d"]);
    expect(capabilitiesFor(avail).map((c) => c.id)).toEqual(["cpu"]);
  });

  it("ignores duplicate ids after freeze", () => {
    registerCapability({
      id: "y", version: "1", label: "Y", requires: [], weight: 0.1,
      budget: { memMBPerMP: 1, timeMsPerMP: 1 },
    });
    freezeRegistry();
    registerCapability({
      id: "z", version: "1", label: "Z", requires: [], weight: 0.1,
      budget: { memMBPerMP: 1, timeMsPerMP: 1 },
    });
    expect(getCapability("z")).toBeUndefined();
  });

  it("registers all 8 built-ins", async () => {
    await import("./builtins");
    const ids = listCapabilities().map((c) => c.id).sort();
    expect(ids).toEqual([
      "bilateral", "clahe", "deblock", "faceRestore",
      "microContrast", "sCurve", "vibrance", "whiteBalance",
    ]);
  });
});
