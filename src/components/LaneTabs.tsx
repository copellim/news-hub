"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useBookmarks } from "@/lib/settings";

const TABS = [
  { href: "/", label: "News" },
  { href: "/papers", label: "Papers" },
  { href: "/da-leggere", label: "Da leggere" },
] as const;

const LINK_CLASS =
  "relative flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium sm:flex-none sm:rounded sm:px-3 sm:py-1.5";

/**
 * Sotto `sm` la navigazione è una barra fissa a fondo schermo: su mobile le tab
 * nell'header competevano con titolo e backup e finivano su una riga a parte.
 * Da `sm` in su torna a essere una riga di tab dentro l'header.
 */
export function LaneTabs() {
  const pathname = usePathname();
  const { bookmarks } = useBookmarks();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-black/10 bg-background pb-[env(safe-area-inset-bottom)] dark:border-white/10 sm:static sm:z-auto sm:gap-1 sm:border-0 sm:bg-transparent sm:pb-0">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? `${LINK_CLASS} sm:bg-foreground sm:text-background`
                : `${LINK_CLASS} opacity-60 hover:opacity-100`
            }
          >
            {/* Su mobile la pillola scura riempirebbe l'intera cella: l'attivo
                si segnala con una barretta in cima. */}
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-foreground sm:hidden"
              />
            )}
            {tab.label}
            {tab.href === "/da-leggere" && bookmarks.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 text-xs tabular-nums text-amber-700 dark:text-amber-300">
                {bookmarks.length}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
