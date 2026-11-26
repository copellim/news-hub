import "server-only";

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import type { ReaderArticle } from "@/lib/reader-model";
import { fetchPage } from "@/lib/sources/http";
import { cleanHtml } from "../sanitize";
import { unavailableArticle, type Extractor } from "./extractor";

/**
 * Below this length Readability has not found an article but the remains of
 * an app: in the verified sample the app pages gave 28 to 463 characters,
 * real articles at least 850.
 */
const MIN_ARTICLE_CHARS = 500;

/**
 * Readability, the same engine as Firefox's reader view, on any
 * site. On the HN and Lobsters sample it extracted 41 articles out of 49, GitHub
 * included; the others fall back to "apri sul sito" (open on the site) with the og description.
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
  // linkedom implements the DOM that Readability uses, but its types are not
  // those of lib.dom: the conversion goes through `unknown`.
  const { document } = parseHTML(html) as unknown as { document: Document };
  // Before Readability, which modifies the document while parsing it.
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

/** On some pages Readability throws (jank-lang.org): it counts as "no article". */
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
