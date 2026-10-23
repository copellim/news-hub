"use client";

import type { FeedItem } from "@/lib/feed";
import { useBookmarks, useSettingsStatus } from "@/lib/settings";

/** Area di tocco minima consigliata su mobile: l'icona da sola è 20 px. */
const TOUCH_TARGET_CLASS = "size-11 shrink-0";

export function SaveToQueueButton({ item }: { item: FeedItem }) {
  const { bookmarkedKeys, toggleBookmark } = useBookmarks();
  const status = useSettingsStatus();
  const isSaved = bookmarkedKeys.has(item.key);

  // I segnalibri stanno nell'account: senza accesso non c'è dove salvarli.
  if (status === "signedOut" || status === "error") {
    return null;
  }
  if (status === "loading") {
    // Il posto resta riservato mentre lo stato arriva.
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
      className={`${TOUCH_TARGET_CLASS} flex items-center justify-center rounded-md ${
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
