"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { spawnRipple } from "@/components/ripple";
import { useBookmarks } from "@/lib/settings";

const TABS = [
  { href: "/", label: "News", icon: <NewsIcon /> },
  { href: "/papers", label: "Papers", icon: <PaperIcon /> },
  { href: "/da-leggere", label: "Da leggere", icon: <BookmarkIcon /> },
] as const;

/**
 * Da `sm` in su le sezioni sono i titoli della pagina: quella attiva scura, le
 * altre grigie. Sotto `sm` è la navigation bar di Material 3, fissa a fondo
 * schermo dove il pollice ci arriva: fondo surfaceContainer, indicatore a
 * pillola secondaryContainer dietro l'icona attiva, livello di stato e onda
 * alla pressione. In cima resta solo il nome della sezione.
 */
export function LaneTabs() {
  const pathname = usePathname();
  const { bookmarks } = useBookmarks();
  const activeTab = TABS.find((tab) => tab.href === pathname);

  return (
    <>
      {activeTab && (
        <span className="text-[26px] leading-none font-semibold tracking-[-0.02em] sm:hidden">
          {activeTab.label}
        </span>
      )}
      <nav
        aria-label="Sezioni"
        className="fixed inset-x-0 bottom-0 z-40 flex bg-nav-surface px-2 pb-[env(safe-area-inset-bottom)] sm:static sm:z-auto sm:gap-6 sm:bg-transparent sm:px-0 sm:pb-0"
      >
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          const count = tab.href === "/da-leggere" ? bookmarks.length : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              onPointerDown={spawnRipple}
              className={`nav-item flex h-20 flex-1 flex-col items-center justify-center gap-1 text-xs [-webkit-tap-highlight-color:transparent] focus-visible:outline-none sm:h-auto sm:flex-none sm:flex-row sm:text-[28px] sm:leading-tight sm:font-semibold sm:tracking-[-0.02em] sm:focus-visible:outline-solid ${
                isActive
                  ? "font-semibold text-ink"
                  : "font-medium text-muted hover:text-ink sm:text-faint sm:hover:text-ink"
              }`}
            >
              <TabIndicator isActive={isActive} count={count}>
                {tab.icon}
              </TabIndicator>
              {tab.label}
              {count > 0 && (
                <span className="hidden self-start pt-1 text-[15px] font-bold text-accent tabular-nums sm:inline">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/**
 * Solo mobile. La pillola è anche il bersaglio del livello di stato e il
 * contenitore dell'onda: su M3 la pressione si vede lì, non sull'intera cella.
 * Il focus da tastiera la contorna, al posto del contorno della cella.
 */
function TabIndicator({
  isActive,
  count,
  children,
}: {
  isActive: boolean;
  count: number;
  children: ReactNode;
}) {
  return (
    <span
      className={`nav-indicator relative flex h-8 w-16 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none sm:hidden [.nav-item:focus-visible_&]:outline-3 [.nav-item:focus-visible_&]:outline-offset-2 [.nav-item:focus-visible_&]:outline-accent ${
        isActive ? "bg-chip text-chip-ink" : "text-muted"
      }`}
    >
      <span
        data-ripple-host
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-full"
      />
      {children}
      {count > 0 && (
        <span className="absolute -top-0.5 right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-bold text-on-accent tabular-nums">
          {count}
        </span>
      )}
    </span>
  );
}

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function NewsIcon() {
  return (
    <TabIcon>
      <path d="M4.75 5.25h10.5v13a1.75 1.75 0 0 0 1.75 1.75H6.5a1.75 1.75 0 0 1-1.75-1.75z" />
      <path d="M15.25 9h3.5v9.25a1.75 1.75 0 0 1-3.5 0" />
      <path d="M7.75 9h4.5M7.75 12.25h4.5M7.75 15.5h3" />
    </TabIcon>
  );
}

function PaperIcon() {
  return (
    <TabIcon>
      <path d="M6.75 3.75h7l4.5 4.5v11a1 1 0 0 1-1 1H6.75a1 1 0 0 1-1-1V4.75a1 1 0 0 1 1-1z" />
      <path d="M13.5 3.75v4.5h4.75" />
      <path d="M8.75 12.5h6.5M8.75 16h4.5" />
    </TabIcon>
  );
}

function BookmarkIcon() {
  return (
    <TabIcon>
      <path d="M6.5 3.75h11v16.5l-5.5-3.75-5.5 3.75z" />
    </TabIcon>
  );
}
