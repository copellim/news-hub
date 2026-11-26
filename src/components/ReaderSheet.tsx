"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { CommentThread } from "@/components/CommentThread";
import { ReaderArticle } from "@/components/ReaderArticle";
import { SaveToQueueButton } from "@/components/SaveToQueueButton";
import { SOURCE_LABELS, type FeedItem } from "@/lib/feed";
import { useReaderArticle, useReaderDiscussion, type ReaderLoad } from "@/lib/reader-content";
import { countComments, hasReadableDiscussion, isSelfPost } from "@/lib/reader-model";

export type ReaderTab = "article" | "comments";

/**
 * The reading card: full-height modal bottom sheet on mobile, modal side sheet
 * on the right from `sm` (styles in `.reader-sheet`, globals.css). It is a
 * `<dialog>` opened with `showModal()`, which already gives trapped focus, Esc
 * and scrim. Article and comments load together on opening: switching to the
 * second tab, it is already ready.
 */
export function ReaderSheet({
  item,
  initialTab,
  onClose,
}: {
  item: FeedItem;
  initialTab: ReaderTab;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const hasArticle = !isSelfPost(item);
  const hasComments = hasReadableDiscussion(item);
  const [tab, setTab] = useState<ReaderTab>(
    initialTab === "comments" && hasComments ? "comments" : hasArticle ? "article" : "comments",
  );

  const article = useReaderArticle(hasArticle ? item.key : null);
  const discussion = useReaderDiscussion(hasComments ? item.key : null);

  useHistoryBackCloses(dialogRef, item.key, onClose);

  const currentLoad = tab === "article" ? article.load : discussion.load;
  const originalUrl = tab === "comments" && item.discussionUrl ? item.discussionUrl : item.url;
  const commentCount =
    discussion.load?.status === "ready"
      ? countComments(discussion.load.value.comments)
      : item.commentCount;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="reader-sheet"
      // A tap on the scrim closes, as in M3 modal sheets: the content fills
      // the dialog, so the dialog itself as the target is the scrim.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
    >
      <div className="flex h-full flex-col">
        <div aria-hidden className="mx-auto mt-2 h-1 w-8 shrink-0 rounded-full bg-faint/40 sm:hidden" />
        <header className="flex shrink-0 items-start gap-1 px-1.5 pt-1.5 sm:px-3 sm:pt-3">
          <IconButton label="Chiudi" onClick={() => dialogRef.current?.close()}>
            <CloseIcon />
          </IconButton>
          <div className="min-w-0 grow py-2.5">
            <p className="text-xs font-semibold text-muted">{SOURCE_LABELS[item.source]}</p>
            {/* The dialog's initial focus goes to the title and not to the X: the
                screen reader reads what opened, and the X does not light up. */}
            <h2
              id={titleId}
              tabIndex={-1}
              data-initial-focus
              className="line-clamp-2 text-base leading-snug font-semibold text-pretty outline-none"
            >
              {item.title}
            </h2>
          </div>
          <SaveToQueueButton item={item} />
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Apri l'originale"
            aria-label="Apri l'originale in una nuova scheda"
            className="state-layer flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink"
          >
            <OpenInNewIcon />
          </a>
        </header>

        {hasArticle && hasComments && (
          <div role="tablist" aria-label="Contenuto" className="flex shrink-0 gap-1 border-b border-rule px-3 sm:px-6">
            <TabButton isSelected={tab === "article"} onSelect={() => setTab("article")}>
              Articolo
            </TabButton>
            <TabButton isSelected={tab === "comments"} onSelect={() => setTab("comments")}>
              {typeof commentCount === "number" ? `Commenti (${commentCount})` : "Commenti"}
            </TabButton>
          </div>
        )}

        <div className="relative h-1 shrink-0">
          {currentLoad?.status === "loading" && <span className="linear-progress" role="progressbar" aria-label="Caricamento" />}
        </div>

        {/* One scrollable panel per tab, both mounted: switching from one
            to the other, each stays where it was left. */}
        {hasArticle && (
          <ReaderPanel isHidden={tab !== "article"} load={article.load} onRetry={article.retry}>
            {(value) => <ReaderArticle article={value} />}
          </ReaderPanel>
        )}
        {hasComments && (
          <ReaderPanel isHidden={tab !== "comments"} load={discussion.load} onRetry={discussion.retry}>
            {(value) => <CommentThread discussion={value} />}
          </ReaderPanel>
        )}
      </div>
    </dialog>
  );
}

/**
 * The back button closes the card instead of leaving the page, like a sheet
 * on Android: on opening an entry is added to the history (Next 16 supports
 * native `history.pushState`), and closing with Esc or with the X removes
 * it. In development `StrictMode` mounts the effect twice: the entry is
 * added only if it is not already there.
 */
function useHistoryBackCloses(
  dialogRef: RefObject<HTMLDialogElement | null>,
  key: string,
  onClose: () => void,
) {
  // The parent passes a new function on every render: the effect must not
  // restart for that, only for a different card.
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
      // React's `autoFocus` does not write the attribute, and `showModal()`
      // would give focus to the first focusable element: the X.
      dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    }
    const isOurEntry = () => window.history.state?.newsHubReader === key;
    if (!isOurEntry()) {
      window.history.pushState({ newsHubReader: key }, "");
    }

    const closeFromHistory = () => dialog.close();
    const handleDialogClose = () => {
      window.removeEventListener("popstate", closeFromHistory);
      if (isOurEntry()) {
        window.history.back();
      }
      handleClose();
    };
    window.addEventListener("popstate", closeFromHistory);
    dialog.addEventListener("close", handleDialogClose);
    return () => {
      window.removeEventListener("popstate", closeFromHistory);
      dialog.removeEventListener("close", handleDialogClose);
    };
  }, [dialogRef, key]);
}

function ReaderPanel<T>({
  isHidden,
  load,
  onRetry,
  children,
}: {
  isHidden: boolean;
  load: ReaderLoad<T> | null;
  onRetry: () => void;
  children: (value: T) => ReactNode;
}) {
  return (
    <div role="tabpanel" hidden={isHidden} className="min-h-0 grow overflow-y-auto overscroll-contain">
      {load?.status === "ready" && children(load.value)}
      {load?.status === "error" && (
        <div className="flex flex-col items-start gap-3 px-5 pt-8 sm:px-8">
          <p className="text-ink">Non sono riuscito a caricarlo: {load.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="state-layer -ml-3 rounded-full px-3 py-2 text-sm font-semibold text-accent"
          >
            Riprova
          </button>
        </div>
      )}
    </div>
  );
}

/** M3 primary tabs, like the sorting ones in the FeedBoard. */
function TabButton({
  isSelected,
  onSelect,
  children,
}: {
  isSelected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onSelect}
      className={`state-layer rounded-t-lg px-3 pt-2.5 pb-3 text-sm ${
        isSelected
          ? "font-semibold text-accent after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-accent"
          : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="state-layer flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink"
    >
      {children}
    </button>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function OpenInNewIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
