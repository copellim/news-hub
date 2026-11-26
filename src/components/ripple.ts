import type { PointerEvent } from "react";

/**
 * Material 3 press ripple: a circle that starts from the touched point and
 * expands inside the element marked `data-ripple-host`, then disappears. The
 * container must be rendered empty by React: only this function adds and
 * removes its children, so reconciliation never touches them.
 */
export function spawnRipple(event: PointerEvent<HTMLElement>): void {
  const host = event.currentTarget.querySelector<HTMLElement>(
    "[data-ripple-host]",
  );
  if (
    !host ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const rect = host.getBoundingClientRect();
  // The touch can land outside the pill (the cell is larger): the ripple
  // starts from the closest point inside the pill.
  const x = clamp(event.clientX - rect.left, 0, rect.width);
  const y = clamp(event.clientY - rect.top, 0, rect.height);
  const size = 2 * Math.hypot(rect.width, rect.height);

  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x - size / 2}px`;
  ripple.style.top = `${y - size / 2}px`;
  ripple.addEventListener("animationend", () => ripple.remove());
  host.append(ripple);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
