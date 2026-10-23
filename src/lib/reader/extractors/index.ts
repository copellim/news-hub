import "server-only";

import { arxivExtractor } from "./arxiv";
import type { Extractor } from "./extractor";
import { genericExtractor } from "./generic";

/**
 * Vince il primo che riconosce l'URL. Un sito che merita un trattamento suo
 * (LessWrong, YouTube, i PDF) è un file in questa cartella e una riga qui,
 * prima del generico, che riconosce tutto.
 */
const EXTRACTORS: readonly Extractor[] = [arxivExtractor, genericExtractor];

export function extractorFor(url: URL): Extractor {
  return EXTRACTORS.find((extractor) => extractor.matches(url)) ?? genericExtractor;
}
