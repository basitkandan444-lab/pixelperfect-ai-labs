// @vitest-environment jsdom
//
// Component reliability tests for the before/after CompareSlider.
//
// These protect the interactive comparison UI — the payoff moment of the whole
// product — from accidental regression. They cover rendering, keyboard
// accessibility (the slider must be operable without a mouse), pointer
// interaction, and the touch path used on mobile. Assertions target ARIA/roles
// and stable labels rather than styling, so they stay green through visual
// tweaks and only fail on real behaviour changes.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CompareSlider } from "./CompareSlider";

const BEFORE = "data:image/png;base64,before";
const AFTER = "data:image/png;base64,after";

function renderSlider(props: Partial<Parameters<typeof CompareSlider>[0]> = {}) {
  return render(<CompareSlider before={BEFORE} after={AFTER} {...props} />);
}

describe("CompareSlider — rendering", () => {
  it("renders both the before and after images with accessible alt text", () => {
    renderSlider({ afterAlt: "Enhanced 4K result" });

    const after = screen.getByAltText("Enhanced 4K result");
    const before = screen.getByAltText("Original low-quality image");

    expect(after).toHaveAttribute("src", AFTER);
    expect(before).toHaveAttribute("src", BEFORE);
  });

  it("uses sensible default alt text when none is supplied", () => {
    renderSlider();
    expect(screen.getByAltText("Enhanced high-resolution result")).toBeInTheDocument();
    expect(screen.getByAltText("Original low-quality image")).toBeInTheDocument();
  });

  it("shows the Before and After labels", () => {
    renderSlider();
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
  });
});

describe("CompareSlider — accessibility", () => {
  it("exposes a labelled slider starting at the midpoint", () => {
    renderSlider();
    const slider = screen.getByRole("slider");

    expect(slider).toHaveAttribute("aria-valuenow", "50");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
    expect(slider).toHaveAccessibleName(/compare before and after/i);
    expect(slider).toHaveAttribute("tabindex", "0");
  });
});

describe("CompareSlider — keyboard interaction", () => {
  let slider: HTMLElement;

  beforeEach(() => {
    renderSlider();
    slider = screen.getByRole("slider");
  });

  it("moves left and right with the arrow keys", () => {
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "54");

    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "46");
  });

  it("jumps to the extremes with Home and End", () => {
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuenow", "100");

    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
  });

  it("clamps within 0–100 and never overshoots", () => {
    for (let i = 0; i < 40; i++) fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");

    for (let i = 0; i < 40; i++) fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("CompareSlider — pointer & touch interaction", () => {
  it("tracks a mouse drag across the container", () => {
    const { container } = renderSlider();
    const root = container.firstElementChild as HTMLElement;
    const slider = screen.getByRole("slider");

    // jsdom returns a zero-size rect by default; stub a real one so the
    // percentage math is deterministic (200px wide starting at x=0).
    root.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;

    fireEvent.mouseDown(slider);
    fireEvent.mouseMove(root, { clientX: 150 });
    expect(slider).toHaveAttribute("aria-valuenow", "75");

    // Releasing stops the drag: further movement is ignored.
    fireEvent.mouseUp(root);
    fireEvent.mouseMove(root, { clientX: 20 });
    expect(slider).toHaveAttribute("aria-valuenow", "75");
  });

  it("responds to touch movement for mobile users", () => {
    const { container } = renderSlider();
    const root = container.firstElementChild as HTMLElement;
    const slider = screen.getByRole("slider");

    root.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect;

    fireEvent.touchStart(slider);
    fireEvent.touchMove(root, { touches: [{ clientX: 25 }] });
    expect(slider).toHaveAttribute("aria-valuenow", "25");
  });
});
