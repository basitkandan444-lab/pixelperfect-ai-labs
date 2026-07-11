import { describe, expect, it } from "vitest";

import { BUILD_INFO, buildAgeSeconds, releaseTag, type BuildInfo } from "@/lib/build-info";

// Build metadata drives release intelligence. In the Vitest runner the Vite
// `define` is not applied, so the safe `typeof` fallbacks must produce a valid,
// serializable BuildInfo rather than throwing.

describe("build-info", () => {
  it("always exposes a well-formed BuildInfo (fallbacks in test env)", () => {
    expect(typeof BUILD_INFO.version).toBe("string");
    expect(typeof BUILD_INFO.commit).toBe("string");
    expect(() => new Date(BUILD_INFO.buildTime).toISOString()).not.toThrow();
    expect(typeof BUILD_INFO.mode).toBe("string");
  });

  it("releaseTag combines version+commit when a real commit is present", () => {
    const info: BuildInfo = {
      version: "1.2.0",
      commit: "ab12cd34ef56",
      buildTime: new Date().toISOString(),
      mode: "production",
    };
    expect(releaseTag(info)).toBe("1.2.0+ab12cd34ef56");
  });

  it("releaseTag falls back to version-mode for local builds", () => {
    const info: BuildInfo = {
      version: "1.2.0",
      commit: "local",
      buildTime: new Date().toISOString(),
      mode: "development",
    };
    expect(releaseTag(info)).toBe("1.2.0-development");
  });

  it("buildAgeSeconds is non-negative and increases with elapsed time", () => {
    const built = "2020-01-01T00:00:00.000Z";
    const info: BuildInfo = { version: "1", commit: "local", buildTime: built, mode: "x" };
    const now = Date.parse(built) + 5000;
    expect(buildAgeSeconds(now, info)).toBe(5);
    expect(buildAgeSeconds(Date.parse(built) - 5000, info)).toBe(0); // clamped
  });

  it("buildAgeSeconds returns 0 for an unparseable build time", () => {
    const info: BuildInfo = { version: "1", commit: "local", buildTime: "not-a-date", mode: "x" };
    expect(buildAgeSeconds(Date.now(), info)).toBe(0);
  });
});
