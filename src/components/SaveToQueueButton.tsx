"use client";

import type { FeedItem } from "@/lib/feed";
import { useBookmarks } from "@/lib/settings";

export function SaveToQueueButton({ item }: { item: FeedItem }) {
  const { bookmarkedKeys, toggleBookmark } = useBookmarks();
  const isSaved = bookmarkedKeys.has(item.key);

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
      className={
        isSaved
          ? "shrink-0 text-amber-500"
          : "shrink-0 opacity-30 hover:opacity-70"
      }
    >
      <StarIcon filled={isSaved} />
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}
