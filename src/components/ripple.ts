import type { PointerEvent } from "react";

/**
 * Onda di pressione di Material 3: un cerchio che parte dal punto toccato e
 * si allarga dentro l'elemento marcato `data-ripple-host`, poi sparisce. Il
 * contenitore va renderizzato vuoto da React: i figli li aggiunge e li toglie
 * solo questa funzione, così la riconciliazione non li tocca mai.
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
  // Il tocco può cadere fuori dalla pillola (la cella è più grande): l'onda
  // parte dal punto più vicino dentro la pillola.
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
