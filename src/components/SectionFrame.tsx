"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { sectionOfPath } from "@/lib/sections";

/**
 * Applica la palette della sezione a tutta la pagina, header e navbar
 * compresi. Sta nel layout, una volta sola, e non nelle pagine: dopo una
 * navigazione Next tiene nel DOM la route precedente nascosta, e due
 * `data-section` vivi insieme si contenderebbero i colori. Il pathname è già
 * giusto nel render del server, quindi niente lampo di colore al caricamento.
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
