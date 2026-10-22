"use client";

import type { FeedItem } from "@/lib/feed";
import { useBookmarks, useSettingsStatus } from "@/lib/settings";

/** Larghezza dell'icona: il posto resta riservato mentre lo stato arriva. */
const STAR_SIZE = 18;

export function SaveToQueueButton({ item }: { item: FeedItem }) {
  const { bookmarkedKeys, toggleBookmark } = useBookmarks();
  const status = useSettingsStatus();
  const isSaved = bookmarkedKeys.has(item.key);

  // I segnalibri stanno nell'account: senza accesso non c'è dove salvarli.
  if (status === "signedOut" || status === "error") {
    return null;
  }
  if (status === "loading") {
    return <span aria-hidden className="shrink-0" style={{ width: STAR_SIZE }} />;
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
      width={STAR_SIZE}
      height={STAR_SIZE}
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
