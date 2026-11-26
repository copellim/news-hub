import "server-only";

import { arxivExtractor } from "./arxiv";
import type { Extractor } from "./extractor";
import { genericExtractor } from "./generic";

/**
 * The first one that recognises the URL wins. A site that deserves its own
 * handling (LessWrong, YouTube, PDFs) is a file in this folder and a line here,
 * before the generic one, which recognises everything.
 */
const EXTRACTORS: readonly Extractor[] = [arxivExtractor, genericExtractor];

export function extractorFor(url: URL): Extractor {
  return EXTRACTORS.find((extractor) => extractor.matches(url)) ?? genericExtractor;
}
