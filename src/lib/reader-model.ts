/**
 * Model of direct reading, the same for every site. Client-safe: no
 * `node:*` dependency, used by both the routes and the card.
 */

import type { FeedItem, SourceId } from "@/lib/feed";

export type ExtractorId = "arxiv" | "generic";

/**
 * The article ready to read, or the reason why it cannot be read here:
 * a page that is an app, a PDF, a site that does not respond.
 */
export type ReaderArticle =
  | {
      status: "ready";
      title: string | null;
      byline: string | null;
      siteName: string | null;
      publishedAt: string | null;
      /** HTML already cleaned on the server, with absolute links and images. */
      html: string;
      sourceUrl: string;
      extractor: ExtractorId;
      /** Papers only: the card shows the abstract and links to the full text. */
      paper: PaperLinks | null;
    }
  | {
      status: "unavailable";
      reason: string;
      excerpt: string | null;
      sourceUrl: string;
    };

export type PaperLinks = {
  /** The item's key (`arxiv:<id>`): needed for the whole-paper summary. */
  key: string;
  /** arXiv's HTML version when there is one, otherwise the PDF. */
  fullTextUrl: string;
  fullTextFormat: "html" | "pdf";
};

/** The whole-paper summary, generated on request and saved for everyone. */
export type PaperDigest = {
  text: string;
  model: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  author: string | null;
  createdAt: string;
  /** Cleaned HTML; `null` for a deleted comment, which keeps its replies. */
  html: string | null;
  /** Missing is `null`, as in `FeedItem`: HN does not expose comment votes. */
  score: number | null;
  replies: Comment[];
};

export type Discussion = {
  source: SourceId;
  url: string;
  /** The post's text when there is no external link (Ask HN, self-post). */
  postHtml: string | null;
  comments: Comment[];
};

export type ReaderPart = "article" | "discussion";

/** The sources with a comments adapter; the others show only the article. */
const DISCUSSION_SOURCES: ReadonlySet<SourceId> = new Set([
  "hackernews",
  "lobsters",
  "huggingface",
]);

export function hasReadableDiscussion(item: FeedItem): boolean {
  return DISCUSSION_SOURCES.has(item.source) && item.discussionUrl !== null;
}

/** Ask HN and Lobsters posts without a link: the content is the discussion itself. */
export function isSelfPost(item: FeedItem): boolean {
  return item.discussionUrl !== null && item.url === item.discussionUrl;
}

export function countComments(comments: readonly Comment[]): number {
  return comments.reduce(
    (total, comment) => total + 1 + countComments(comment.replies),
    0,
  );
}
