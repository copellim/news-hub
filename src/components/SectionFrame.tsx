"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { sectionOfPath } from "@/lib/sections";

/**
 * Applies the section's palette to the whole page, header and navbar
 * included. It lives in the layout, only once, and not in the pages: after a
 * navigation Next keeps the previous route hidden in the DOM, and two live
 * `data-section` together would fight over the colours. The pathname is
 * already right in the server render, so no colour flash on load.
 */
export function SectionFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      data-section={sectionOfPath(pathname)}
      className="flex min-h-dvh flex-col bg-surface text-ink"
    >
      {children}
    </div>
  );
}
