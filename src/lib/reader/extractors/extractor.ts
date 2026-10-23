import "server-only";

import type { ExtractorId, ReaderArticle } from "@/lib/reader-model";

/**
 * Un modo di trasformare un indirizzo in articolo. Gli estrattori stanno in una
 * lista ordinata e vince il primo che riconosce l'URL: quelli dedicati a un
 * sito prima, il generico in fondo.
 */
export type Extractor = {
  id: ExtractorId;
  matches(url: URL): boolean;
  /** Lancia sugli errori di rete: chi chiama decide, e l'errore non entra in cache. */
  extract(url: URL): Promise<ReaderArticle>;
};

export function unavailableArticle(
  sourceUrl: string,
  reason: string,
  excerpt: string | null = null,
): ReaderArticle {
  return { status: "unavailable", reason, excerpt, sourceUrl };
}
