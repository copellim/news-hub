"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { AccountMenu } from "@/components/AccountMenu";
import { SECTIONS, sectionOfPath } from "@/lib/sections";

/**
 * Material 3 small top app bar: one row with the section name, fixed at the
 * top. The title stays discreet because the navigation already says the
 * section; when the page scrolls the bar switches to the container tone
 * and detaches from the content.
 */
export function AppBar() {
  const pathname = usePathname();
  const section = sectionOfPath(pathname);
  const label = SECTIONS.find((candidate) => candidate.id === section)?.label;
  const isScrolled = useIsScrolled();

  return (
    <header
      data-scrolled={isScrolled}
      className="sticky top-0 z-30 bg-surface transition-colors duration-200 motion-reduce:transition-none data-[scrolled=true]:bg-nav-surface"
    >
      <div className="mx-auto flex h-16 w-full max-w-188 items-center gap-4 px-5 sm:px-6">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">
          {label}
        </h1>
        <div className="ml-auto">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** On the server the page is always at the top. */
function useIsScrolled(): boolean {
  return useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > 0,
    () => false,
  );
}
