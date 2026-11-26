import "server-only";

import type { ExtractorId, ReaderArticle } from "@/lib/reader-model";

/**
 * A way of turning an address into an article. The extractors sit in an
 * ordered list and the first one that recognises the URL wins: the ones
 * dedicated to a site first, the generic one at the bottom.
 */
export type Extractor = {
  id: ExtractorId;
  matches(url: URL): boolean;
  /** Throws on network errors: the caller decides, and the error does not enter the cache. */
  extract(url: URL): Promise<ReaderArticle>;
};

export function unavailableArticle(
  sourceUrl: string,
  reason: string,
  excerpt: string | null = null,
): ReaderArticle {
  return { status: "unavailable", reason, excerpt, sourceUrl };
}
