"use client";

import { FeedList } from "@/components/FeedList";
import type { FeedItem } from "@/lib/feed";
import { useBookmarks } from "@/lib/settings";

export function ReadingQueueBoard() {
  const { bookmarks, removeBookmark } = useBookmarks();

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
