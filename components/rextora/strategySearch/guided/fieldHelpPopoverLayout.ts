import type { CSSProperties } from "react";

export const FIELD_HELP_VIEWPORT_MARGIN_PX = 12;
export const FIELD_HELP_ANCHOR_GAP_PX = 10;
export const FIELD_HELP_MOBILE_MAX_WIDTH_PX = 340;
export const FIELD_HELP_MOBILE_BREAKPOINT_PX = 768;

export type FieldHelpPopoverPlacement = "right" | "left" | "below";

export type FieldHelpPopoverLayout = {
  placement: FieldHelpPopoverPlacement;
  style: CSSProperties;
  caretTopPx: number;
  caretLeftPx: number | null;
};

type Rect = Pick<DOMRect, "top" | "left" | "right" | "bottom" | "width" | "height">;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Desktop/tablet: popover beside trigger with 8–12px gap. */
export function computeDesktopAnchoredPopoverLayout(input: {
  trigger: Rect;
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): FieldHelpPopoverLayout {
  const { trigger: tr, popoverWidth, popoverHeight } = input;
  const vw = input.viewportWidth;
  const vh = input.viewportHeight;
  const margin = FIELD_HELP_VIEWPORT_MARGIN_PX;
  const gap = FIELD_HELP_ANCHOR_GAP_PX;
  const width = popoverWidth;
  const height = popoverHeight;

  let placement: FieldHelpPopoverPlacement = "right";
  let left = tr.right + gap;

  const fitsRight = left + width <= vw - margin;
  if (!fitsRight) {
    const leftSide = tr.left - width - gap;
    if (leftSide >= margin) {
      left = leftSide;
      placement = "left";
    } else if (tr.right + gap + width <= vw - margin) {
      left = tr.right + gap;
      placement = "right";
    } else {
      left = leftSide;
      placement = "left";
      left = clamp(left, margin, vw - margin - width);
    }
  }

  if (placement === "right" && left < tr.right + gap - 1) {
    left = tr.right + gap;
  }
  if (placement === "left" && left + width > tr.left - gap + 1) {
    left = tr.left - width - gap;
  }

  left = clamp(left, margin, Math.max(margin, vw - margin - width));

  let top = tr.top + tr.height / 2 - height / 2;
  top = clamp(top, margin, Math.max(margin, vh - margin - height));

  const triggerCenterY = tr.top + tr.height / 2;
  const caretTopPx = clamp(triggerCenterY - top, 12, Math.max(12, height - 12));

  return {
    placement,
    caretTopPx,
    caretLeftPx: null,
    style: {
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxWidth: `min(${FIELD_HELP_MOBILE_MAX_WIDTH_PX}px, calc(100vw - 24px))`,
      transform: "none",
    },
  };
}

/** Mobile: below trigger, viewport-safe width (preserves verified behavior). */
export function computeMobilePopoverLayout(input: {
  trigger: Rect;
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): FieldHelpPopoverLayout {
  const { trigger: tr } = input;
  const vw = input.viewportWidth;
  const vh = input.viewportHeight;
  const margin = FIELD_HELP_VIEWPORT_MARGIN_PX;
  const gap = FIELD_HELP_ANCHOR_GAP_PX;
  const width = Math.min(
    input.popoverWidth,
    vw - 24,
    FIELD_HELP_MOBILE_MAX_WIDTH_PX,
  );
  const height = input.popoverHeight;

  let left = tr.left + tr.width / 2 - width / 2;
  left = clamp(left, margin, Math.max(margin, vw - margin - width));

  let top = tr.bottom + gap;
  top = clamp(top, margin, Math.max(margin, vh - margin - height));

  const triggerCenterX = tr.left + tr.width / 2;
  const caretLeftPx = clamp(triggerCenterX - left, 16, Math.max(16, width - 16));

  const triggerCenterY = tr.top + tr.height / 2;
  const caretTopPx = clamp(triggerCenterY - top, 8, 12);

  return {
    placement: "below",
    caretTopPx,
    caretLeftPx,
    style: {
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxWidth: "calc(100vw - 24px)",
      transform: "none",
    },
  };
}

export function computeFieldHelpPopoverLayout(input: {
  trigger: Rect;
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): FieldHelpPopoverLayout {
  if (input.viewportWidth < FIELD_HELP_MOBILE_BREAKPOINT_PX) {
    return computeMobilePopoverLayout(input);
  }
  return computeDesktopAnchoredPopoverLayout(input);
}
