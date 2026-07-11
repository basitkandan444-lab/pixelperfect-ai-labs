import { describe, expect, it } from "vitest";

import { getLanding, landingHead, LANDING_PAGES, type LandingPath } from "@/lib/landing";

// The landing pages are the product's SEO surface. A duplicate slug, a broken
// internal "related" link, or missing metadata is an invisible regression that
// only shows up as lost search traffic. These tests catch data-integrity drift.

const paths = new Set<LandingPath>(LANDING_PAGES.map((p) => p.path));

describe("LANDING_PAGES data integrity", () => {
  it("has unique slugs and paths", () => {
    const slugs = LANDING_PAGES.map((p) => p.slug);
    const routePaths = LANDING_PAGES.map((p) => p.path);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(routePaths).size).toBe(routePaths.length);
  });

  it("keeps every slug consistent with its route path", () => {
    for (const p of LANDING_PAGES) {
      expect(p.path).toBe(`/${p.slug}`);
    }
  });

  it("only links related pages that actually exist", () => {
    for (const page of LANDING_PAGES) {
      for (const rel of page.related) {
        expect(paths.has(rel.path)).toBe(true);
        // A page should never link to itself as a "related" page.
        expect(rel.path).not.toBe(page.path);
      }
    }
  });

  it("provides the metadata every route head() needs", () => {
    for (const p of LANDING_PAGES) {
      expect(p.h1.length).toBeGreaterThan(0);
      expect(p.metaTitle.length).toBeGreaterThan(0);
      expect(p.metaDescription.length).toBeGreaterThan(0);
      expect(p.ogTitle.length).toBeGreaterThan(0);
      expect(p.faqs.length).toBeGreaterThan(0);
    }
  });
});

describe("getLanding", () => {
  it("returns the page for a known slug", () => {
    expect(getLanding("ai-image-enhancer").path).toBe("/ai-image-enhancer");
  });

  it("throws for an unknown slug instead of returning undefined", () => {
    expect(() => getLanding("does-not-exist")).toThrow();
  });
});

describe("landingHead", () => {
  const page = LANDING_PAGES[0];

  it("builds an absolute canonical when an origin is known", () => {
    const head = landingHead("https://example.com", page);
    expect(head.links[0]).toEqual({ rel: "canonical", href: `https://example.com${page.path}` });
  });

  it("falls back to a relative canonical when the origin is unknown", () => {
    const head = landingHead(undefined, page);
    expect(head.links[0].href).toBe(page.path);
  });

  it("emits valid JSON-LD structured data", () => {
    const head = landingHead("https://example.com", page);
    expect(() => JSON.parse(head.scripts[0].children)).not.toThrow();
  });
});
