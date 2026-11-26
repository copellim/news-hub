"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { spawnRipple } from "@/components/ripple";
import { SECTIONS, sectionOfPath, type SectionId } from "@/lib/sections";
import { useBookmarks } from "@/lib/settings";

const SECTION_ICONS: Record<SectionId, ReactNode> = {
  news: <NewsIcon />,
  papers: <PaperIcon />,
  queue: <BookmarkIcon />,
};

/**
 * Material 3 navigation, the same in two positions: below `sm` it is the
 * navigation bar fixed at the bottom of the screen, where the thumb reaches;
 * from `sm` up it is the navigation rail on the left. Same items, same
 * secondaryContainer pill behind the active icon, same state layer and same
 * ripple on press.
 */
export function LaneTabs() {
  const pathname = usePathname();
  const activeSection = sectionOfPath(pathname);
  const { bookmarks } = useBookmarks();

  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-40 flex bg-nav-surface px-2 pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:top-0 sm:left-0 sm:w-20 sm:flex-col sm:gap-3 sm:px-0 sm:pt-6 sm:pb-0"
    >
      {SECTIONS.map((section) => {
        const isActive = section.id === activeSection;
        const count = section.id === "queue" ? bookmarks.length : 0;
        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={isActive ? "page" : undefined}
            onPointerDown={spawnRipple}
            className={`nav-item flex h-20 flex-1 flex-col items-center justify-center gap-1 text-xs [-webkit-tap-highlight-color:transparent] focus-visible:outline-none sm:h-16 sm:flex-none ${
              isActive ? "font-semibold text-ink" : "font-medium text-muted"
            }`}
          >
            <TabIndicator isActive={isActive} count={count}>
              {SECTION_ICONS[section.id]}
            </TabIndicator>
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The pill is also the target of the state layer and the container of the
 * ripple: in M3 the press shows there, not on the whole cell. Keyboard focus
 * outlines it, instead of outlining the cell.
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
      className={`nav-indicator relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none [.nav-item:focus-visible_&]:outline-3 [.nav-item:focus-visible_&]:outline-offset-2 [.nav-item:focus-visible_&]:outline-accent ${
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
        <span className="absolute -top-0.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-bold text-on-accent tabular-nums">
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
