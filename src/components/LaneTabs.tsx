"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useBookmarks } from "@/lib/settings";

const TABS = [
  { href: "/", label: "News" },
  { href: "/papers", label: "Papers" },
  { href: "/da-leggere", label: "Da leggere" },
] as const;

/**
 * Da `sm` in su le sezioni sono i titoli della pagina: quella attiva scura, le
 * altre grigie. Sotto `sm` la navigazione è una barra fissa a fondo schermo,
 * dove il pollice ci arriva, e in cima resta solo il nome della sezione.
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
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] sm:static sm:z-auto sm:gap-6 sm:border-0 sm:bg-transparent sm:pb-0"
      >
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex h-15 flex-1 items-center justify-center gap-1 text-[15px] font-semibold sm:h-auto sm:flex-none sm:text-[28px] sm:leading-tight sm:tracking-[-0.02em] ${
                isActive
                  ? "text-ink"
                  : "text-muted hover:text-ink sm:text-faint sm:hover:text-ink"
              }`}
            >
              {/* Su mobile l'attivo si segnala anche con una barretta in cima. */}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent sm:hidden"
                />
              )}
              {tab.label}
              {tab.href === "/da-leggere" && bookmarks.length > 0 && (
                <span className="font-sans text-xs font-bold text-accent tabular-nums sm:self-start sm:pt-1 sm:text-[15px]">
                  {bookmarks.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
