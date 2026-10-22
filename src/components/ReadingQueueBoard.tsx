"use client";

import { FeedList } from "@/components/FeedList";
import type { FeedItem } from "@/lib/feed";
import { useBookmarks, useSettingsStatus } from "@/lib/settings";

const STATUS_MESSAGES = {
  loading: "Carico i segnalibri…",
  signedOut: "Accedi con Google, in alto a destra, per vedere i tuoi segnalibri.",
  error: "Segnalibri non disponibili: il caricamento dallo storage è fallito.",
} as const;

export function ReadingQueueBoard() {
  const { bookmarks, removeBookmark } = useBookmarks();
  const status = useSettingsStatus();

  if (status !== "ready") {
    return (
      <p className="py-8 text-center text-sm opacity-60">
        {STATUS_MESSAGES[status]}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs opacity-60">
        {bookmarks.length} {bookmarks.length === 1 ? "articolo" : "articoli"} da
        leggere
      </span>

      <FeedList
        lane={{ items: bookmarks, failures: [] }}
        emptyLabel="Nessun articolo: usa la stella accanto a un titolo per salvarlo qui."
        rowAction={(item) => (
          <MarkAsReadButton item={item} onMarkAsRead={removeBookmark} />
        )}
      />
    </div>
  );
}

function MarkAsReadButton({
  item,
  onMarkAsRead,
}: {
  item: FeedItem;
  onMarkAsRead: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onMarkAsRead(item.key)}
      aria-label={`Segna come letto: ${item.title}`}
      className="h-fit shrink-0 self-center rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    >
      Letto
    </button>
  );
}
