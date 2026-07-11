// Shared Vitest setup. Applied to every test file (see vitest.config.ts).
//
// - Registers jest-dom matchers (toBeInTheDocument, toHaveAttribute, …) so
//   component assertions read naturally. Harmless in node-env logic tests.
// - Unmounts any React tree rendered by @testing-library/react after each test
//   to keep tests isolated (RTL's auto-cleanup relies on a global afterEach,
//   which is disabled here because `globals: false`).
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement ResizeObserver, which CompareSlider uses to track its
// width. Provide a no-op so component tests can mount it. Guarded to the jsdom
// env so node-env logic tests are untouched.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});
