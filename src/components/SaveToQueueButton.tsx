"use client";

import type { FeedItem } from "@/lib/feed";
import { useBookmarks, useSettingsStatus } from "@/lib/settings";

/** Minimum recommended touch target on mobile: the icon alone is 20 px. */
const TOUCH_TARGET_CLASS = "size-11 shrink-0";

export function SaveToQueueButton({ item }: { item: FeedItem }) {
  const { bookmarkedKeys, toggleBookmark } = useBookmarks();
  const status = useSettingsStatus();
  const isSaved = bookmarkedKeys.has(item.key);

  // Bookmarks live in the account: without sign-in there is nowhere to save them.
  if (status === "signedOut" || status === "error") {
    return null;
  }
  if (status === "loading") {
    // The space stays reserved while the state arrives.
    return <span aria-hidden className={TOUCH_TARGET_CLASS} />;
  }

  return (
    <button
      type="button"
      onClick={() => toggleBookmark(item)}
      aria-pressed={isSaved}
      title={isSaved ? "Togli dai segnalibri" : "Salva per dopo"}
      aria-label={
        isSaved
          ? `Togli dai segnalibri: ${item.title}`
          : `Salva per dopo: ${item.title}`
      }
      className={`${TOUCH_TARGET_CLASS} state-layer flex items-center justify-center rounded-full ${
        isSaved ? "text-accent" : "text-faint hover:text-ink"
      }`}
    >
      <BookmarkIcon filled={isSaved} />
    </button>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3.5h12v17l-6-4-6 4z" />
    </svg>
  );
}
