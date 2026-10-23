import "server-only";

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import type { ReaderArticle } from "@/lib/reader-model";
import { fetchPage } from "@/lib/sources/http";
import { cleanHtml } from "../sanitize";
import { unavailableArticle, type Extractor } from "./extractor";

/**
 * Sotto questa lunghezza Readability non ha trovato un articolo ma i resti di
 * un'app: nel campione verificato le pagine-app davano da 28 a 463 caratteri,
 * gli articoli veri almeno 850.
 */
const MIN_ARTICLE_CHARS = 500;

/**
 * Readability, lo stesso motore della vista lettura di Firefox, su qualsiasi
 * sito. Sul campione di HN e Lobsters ha estratto 41 articoli su 49, GitHub
 * compreso; gli altri ricadono su "apri sul sito" con la descrizione og.
 */
export const genericExtractor: Extractor = {
  id: "generic",
  matches: () => true,
  async extract(url) {
    const page = await fetchPage("articolo", url.href);
    if (page.html === null) {
      return unavailableArticle(
        url.href,
        `Il link porta a un file (${page.contentType || "tipo sconosciuto"}), non a una pagina.`,
      );
    }
    return articleFromHtml(page.html, url.href, page.finalUrl);
  },
};

export function articleFromHtml(
  html: string,
  sourceUrl: string,
  baseUrl: string,
): ReaderArticle {
  // linkedom implementa il DOM che Readability usa, ma i suoi tipi non sono
  // quelli di lib.dom: la conversione passa da `unknown`.
  const { document } = parseHTML(html) as unknown as { document: Document };
  // Prima di Readability, che modifica il documento mentre lo analizza.
  const description = metaContent(document, "og:description", "description");
  const siteName = metaContent(document, "og:site_name");

  const parsed = parseWithReadability(document);
  const text = parsed?.textContent?.trim() ?? "";
  if (!parsed?.content || text.length < MIN_ARTICLE_CHARS) {
    return unavailableArticle(
      sourceUrl,
      "Questa pagina non ha un testo da leggere qui: probabilmente è un'applicazione.",
      description ?? (parsed?.excerpt?.trim() || null),
    );
  }

  return {
    status: "ready",
    title: parsed.title?.trim() || null,
    byline: parsed.byline?.trim() || null,
    siteName: parsed.siteName?.trim() || siteName,
    publishedAt: parsed.publishedTime?.trim() || null,
    html: cleanHtml(parsed.content, baseUrl),
    sourceUrl,
    extractor: "generic",
    paper: null,
  };
}

/** Su qualche pagina Readability va in errore (jank-lang.org): vale come "niente articolo". */
function parseWithReadability(document: Document) {
  try {
    return new Readability(document).parse();
  } catch (error) {
    console.error("Readability non ha analizzato la pagina", error);
    return null;
  }
}

function metaContent(document: Document, ...names: string[]): string | null {
  for (const name of names) {
    const content = document
      .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.getAttribute("content")
      ?.trim();
    if (content) {
      return content;
    }
  }
  return null;
}
