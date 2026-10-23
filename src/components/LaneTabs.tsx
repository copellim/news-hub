"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useBookmarks } from "@/lib/settings";

/** `section` è il `data-section` che sceglie l'accento in globals.css. */
const TABS = [
  { href: "/", label: "News", section: "news", icon: <NewsIcon /> },
  { href: "/papers", label: "Papers", section: "papers", icon: <PaperIcon /> },
  {
    href: "/da-leggere",
    label: "Da leggere",
    section: "queue",
    icon: <BookmarkIcon />,
  },
] as const;

/**
 * Da `sm` in su le sezioni sono i titoli della pagina: quella attiva scura, le
 * altre grigie. Sotto `sm` la navigazione è una barra fissa a fondo schermo,
 * dove il pollice ci arriva, con icona ed etichetta; in cima resta solo il
 * nome della sezione.
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
        data-section={activeTab?.section ?? "news"}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-nav-surface/85 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgb(0_0_0/0.05)] backdrop-blur-lg sm:static sm:z-auto sm:gap-6 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:shadow-none sm:backdrop-blur-none"
      >
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          const count = tab.href === "/da-leggere" ? bookmarks.length : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`group flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold sm:h-auto sm:flex-none sm:flex-row sm:gap-1 sm:text-[28px] sm:leading-tight sm:tracking-[-0.02em] ${
                isActive
                  ? "text-ink"
                  : "text-muted hover:text-ink sm:text-faint sm:hover:text-ink"
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
 * Solo mobile: la pillola tenue dietro l'icona attiva dice dove sei senza
 * colorare l'intera cella.
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
      className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors motion-reduce:transition-none sm:hidden ${
        isActive ? "bg-chip text-chip-ink" : ""
      }`}
    >
      {children}
      {count > 0 && (
        <span className="absolute top-0 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-bold text-on-accent tabular-nums">
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
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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
