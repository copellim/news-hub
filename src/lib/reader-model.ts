/**
 * Modello della lettura diretta, uguale per ogni sito. Client-safe: nessuna
 * dipendenza `node:*`, lo usano sia le route sia la card.
 */

import type { FeedItem, SourceId } from "@/lib/feed";

export type ExtractorId = "arxiv" | "generic";

/**
 * L'articolo pronto da leggere, oppure il motivo per cui qui non si può:
 * una pagina che è un'app, un PDF, un sito che non risponde.
 */
export type ReaderArticle =
  | {
      status: "ready";
      title: string | null;
      byline: string | null;
      siteName: string | null;
      publishedAt: string | null;
      /** HTML già ripulito sul server, con link e immagini assoluti. */
      html: string;
      sourceUrl: string;
      extractor: ExtractorId;
      /** Solo per i paper: la card mostra l'abstract e rimanda al testo intero. */
      paper: PaperLinks | null;
    }
  | {
      status: "unavailable";
      reason: string;
      excerpt: string | null;
      sourceUrl: string;
    };

export type PaperLinks = {
  /** Chiave dell'item (`arxiv:<id>`): serve per il riassunto del paper intero. */
  key: string;
  /** La versione HTML di arXiv quando c'è, altrimenti il PDF. */
  fullTextUrl: string;
  fullTextFormat: "html" | "pdf";
};

/** Il riassunto del paper intero, generato a richiesta e salvato per tutti. */
export type PaperDigest = {
  text: string;
  model: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  author: string | null;
  createdAt: string;
  /** HTML ripulito; `null` per un commento cancellato, che tiene le risposte. */
  html: string | null;
  /** Assente è `null`, come nei `FeedItem`: HN non espone i voti dei commenti. */
  score: number | null;
  replies: Comment[];
};

export type Discussion = {
  source: SourceId;
  url: string;
  /** Il testo del post quando non c'è un link esterno (Ask HN, self-post). */
  postHtml: string | null;
  comments: Comment[];
};

export type ReaderPart = "article" | "discussion";

/** Le fonti con un adapter per i commenti; le altre mostrano solo l'articolo. */
const DISCUSSION_SOURCES: ReadonlySet<SourceId> = new Set([
  "hackernews",
  "lobsters",
  "huggingface",
]);

export function hasReadableDiscussion(item: FeedItem): boolean {
  return DISCUSSION_SOURCES.has(item.source) && item.discussionUrl !== null;
}

/** Ask HN e i post Lobsters senza link: il contenuto è la discussione stessa. */
export function isSelfPost(item: FeedItem): boolean {
  return item.discussionUrl !== null && item.url === item.discussionUrl;
}

export function countComments(comments: readonly Comment[]): number {
  return comments.reduce(
    (total, comment) => total + 1 + countComments(comment.replies),
    0,
  );
}
