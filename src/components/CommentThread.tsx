"use client";

import { useState } from "react";

import { PublishedAt } from "@/components/PublishedAt";
import { useNow } from "@/lib/now";
import { countComments, type Comment, type Discussion } from "@/lib/reader-model";

/**
 * Beyond this depth the indentation stops growing: on a phone an HN thread
 * 10 levels deep would leave the text a column of a few words.
 * From `sm` there is room and the limit goes up.
 */
const MOBILE_INDENT_LEVELS = 4;
const DESKTOP_INDENT_LEVELS = 8;

export function CommentThread({ discussion }: { discussion: Discussion }) {
  const now = useNow();

  return (
    <div className="mx-auto flex max-w-[72ch] flex-col gap-5 px-4 pt-5 pb-16 sm:px-8">
      {discussion.postHtml && (
        <div
          className="reader-prose border-b border-rule pb-5"
          dangerouslySetInnerHTML={{ __html: discussion.postHtml }}
        />
      )}
      {discussion.comments.length === 0 ? (
        <p className="py-6 text-center text-muted">Ancora nessun commento.</p>
      ) : (
        <ol className="flex flex-col gap-5">
          {discussion.comments.map((comment) => (
            <CommentNode key={comment.id} comment={comment} depth={0} now={now} />
          ))}
        </ol>
      )}
    </div>
  );
}

function CommentNode({
  comment,
  depth,
  now,
}: {
  comment: Comment;
  depth: number;
  now: number | null;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const replyCount = countComments(comment.replies);

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex min-h-8 items-center gap-2 text-sm text-muted">
        {replyCount > 0 && (
          <button
            type="button"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed
                ? `Mostra ${repliesLabel(replyCount)}`
                : `Nascondi ${repliesLabel(replyCount)}`
            }
            className="state-layer -ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-full"
          >
            <ChevronIcon isCollapsed={isCollapsed} />
          </button>
        )}
        <span className="font-semibold text-ink">{comment.author ?? "[cancellato]"}</span>
        <PublishedAt iso={comment.createdAt} now={now} />
        {typeof comment.score === "number" && (
          <span className="tabular-nums">
            {comment.score} {comment.score === 1 ? "punto" : "punti"}
          </span>
        )}
        {isCollapsed && (
          <span>· {replyCount === 1 ? "1 risposta nascosta" : `${replyCount} risposte nascoste`}</span>
        )}
      </div>

      {comment.html === null ? (
        <p className="text-[15px] text-muted italic">Commento cancellato.</p>
      ) : (
        <div
          className="reader-comment"
          dangerouslySetInnerHTML={{ __html: comment.html }}
        />
      )}

      {!isCollapsed && comment.replies.length > 0 && (
        <ol className={`mt-2 flex flex-col gap-4 ${indentClassOf(depth + 1)}`}>
          {comment.replies.map((reply) => (
            <CommentNode key={reply.id} comment={reply} depth={depth + 1} now={now} />
          ))}
        </ol>
      )}
    </li>
  );
}

/** Indentation and vertical thread up to the limit; beyond it, replies align with the parent. */
function indentClassOf(depth: number): string {
  if (depth <= MOBILE_INDENT_LEVELS) {
    return "ml-1 border-l-2 border-rule pl-3 sm:pl-4";
  }
  if (depth <= DESKTOP_INDENT_LEVELS) {
    return "sm:ml-1 sm:border-l-2 sm:border-rule sm:pl-4";
  }
  return "";
}

function repliesLabel(count: number): string {
  return count === 1 ? "1 risposta" : `${count} risposte`;
}

function ChevronIcon({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-150 motion-reduce:transition-none ${
        isCollapsed ? "-rotate-90" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
