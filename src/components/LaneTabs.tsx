"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useBookmarks } from "@/lib/settings";

const TABS = [
  { href: "/", label: "News" },
  { href: "/papers", label: "Papers" },
  { href: "/da-leggere", label: "Da leggere" },
] as const;

export function LaneTabs() {
  const pathname = usePathname();
  const { bookmarks } = useBookmarks();

  return (
    <nav className="flex gap-1">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "flex items-center gap-1.5 rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background"
                : "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium opacity-60 hover:opacity-100"
            }
          >
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
