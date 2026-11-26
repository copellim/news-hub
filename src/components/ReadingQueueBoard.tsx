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
      <p className="py-10 text-center text-muted">
        {STATUS_MESSAGES[status]}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="px-1 text-sm text-muted sm:px-4">
        {bookmarks.length} {bookmarks.length === 1 ? "articolo" : "articoli"} da
        leggere
      </span>

      <FeedList
        lane={{ items: bookmarks, failures: [] }}
        emptyLabel="Nessun articolo: usa il segnalibro accanto a un titolo per salvarlo qui."
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
      // M3 tonal button: secondaryContainer, pill-shaped.
      className="state-layer h-10 shrink-0 rounded-full bg-chip px-4 text-sm font-semibold text-chip-ink"
    >
      Letto
    </button>
  );
}
