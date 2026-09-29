import { describe, expect, it } from "vitest";
import {
  FIELD_HELP_ANCHOR_GAP_PX,
  FIELD_HELP_MOBILE_BREAKPOINT_PX,
  FIELD_HELP_VIEWPORT_MARGIN_PX,
  computeDesktopAnchoredPopoverLayout,
  computeFieldHelpPopoverLayout,
  computeMobilePopoverLayout,
} from "@/components/rextora/strategySearch/guided/fieldHelpPopoverLayout";

const trigger = (left: number, top: number, size = 28) => ({
  left,
  top,
  right: left + size,
  bottom: top + size,
  width: size,
  height: size,
});

describe("fieldHelpPopoverLayout", () => {
  it("A: desktop right-anchored placement beside trigger", () => {
    const layout = computeDesktopAnchoredPopoverLayout({
      trigger: trigger(100, 200),
      popoverWidth: 280,
      popoverHeight: 160,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(layout.placement).toBe("right");
    const left = Number.parseInt(String(layout.style.left), 10);
    expect(left).toBe(100 + 28 + FIELD_HELP_ANCHOR_GAP_PX);
  });

  it("B: desktop left-anchored when insufficient room on the right", () => {
    const layout = computeDesktopAnchoredPopoverLayout({
      trigger: trigger(1200, 200),
      popoverWidth: 280,
      popoverHeight: 160,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(layout.placement).toBe("left");
    const left = Number.parseInt(String(layout.style.left), 10);
    expect(left).toBe(1200 - 280 - FIELD_HELP_ANCHOR_GAP_PX);
  });

  it("C: anchor gap stays within 8–12px contract", () => {
    expect(FIELD_HELP_ANCHOR_GAP_PX).toBeGreaterThanOrEqual(8);
    expect(FIELD_HELP_ANCHOR_GAP_PX).toBeLessThanOrEqual(12);
    const tr = trigger(400, 300);
    const layout = computeDesktopAnchoredPopoverLayout({
      trigger: tr,
      popoverWidth: 260,
      popoverHeight: 140,
      viewportWidth: 1200,
      viewportHeight: 800,
    });
    const left = Number.parseInt(String(layout.style.left), 10);
    const gap =
      layout.placement === "right"
        ? left - tr.right
        : tr.left - (left + 260);
    expect(gap).toBe(FIELD_HELP_ANCHOR_GAP_PX);
  });

  it("D: layout exposes caret offset for placement-specific CSS", () => {
    const layout = computeDesktopAnchoredPopoverLayout({
      trigger: trigger(100, 200),
      popoverWidth: 280,
      popoverHeight: 160,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(layout.caretTopPx).toBeGreaterThanOrEqual(12);
    expect(layout.caretTopPx).toBeLessThanOrEqual(148);
    expect(layout.caretLeftPx).toBeNull();
  });

  it("E: viewport clamp does not detach popover when anchor fits", () => {
    const tr = trigger(500, 400);
    const layout = computeDesktopAnchoredPopoverLayout({
      trigger: tr,
      popoverWidth: 280,
      popoverHeight: 160,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    const left = Number.parseInt(String(layout.style.left), 10);
    expect(left).toBe(tr.right + FIELD_HELP_ANCHOR_GAP_PX);
    const top = Number.parseInt(String(layout.style.top), 10);
    expect(top).toBeGreaterThanOrEqual(FIELD_HELP_VIEWPORT_MARGIN_PX);
    expect(top + 160).toBeLessThanOrEqual(900 - FIELD_HELP_VIEWPORT_MARGIN_PX);
  });

  it("F: mobile viewport-safe width contract", () => {
    const layout = computeMobilePopoverLayout({
      trigger: trigger(20, 100),
      popoverWidth: 340,
      popoverHeight: 180,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(layout.placement).toBe("below");
    expect(String(layout.style.maxWidth)).toBe("calc(100vw - 24px)");
    const width = Number.parseInt(String(layout.style.width), 10);
    expect(width).toBeLessThanOrEqual(390 - 24);
  });

  it("G: computeFieldHelpPopoverLayout switches at mobile breakpoint", () => {
    const desktop = computeFieldHelpPopoverLayout({
      trigger: trigger(100, 200),
      popoverWidth: 280,
      popoverHeight: 160,
      viewportWidth: FIELD_HELP_MOBILE_BREAKPOINT_PX,
      viewportHeight: 900,
    });
    expect(desktop.placement).toMatch(/left|right/);

    const mobile = computeFieldHelpPopoverLayout({
      trigger: trigger(100, 200),
      popoverWidth: 280,
      popoverHeight: 160,
      viewportWidth: FIELD_HELP_MOBILE_BREAKPOINT_PX - 1,
      viewportHeight: 900,
    });
    expect(mobile.placement).toBe("below");
  });

  it("vertical viewport safety keeps popover inside margins", () => {
    const layout = computeDesktopAnchoredPopoverLayout({
      trigger: trigger(100, 850, 28),
      popoverWidth: 280,
      popoverHeight: 160,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    const top = Number.parseInt(String(layout.style.top), 10);
    expect(top).toBeGreaterThanOrEqual(FIELD_HELP_VIEWPORT_MARGIN_PX);
    expect(top + 160).toBeLessThanOrEqual(900 - FIELD_HELP_VIEWPORT_MARGIN_PX);
  });
});
