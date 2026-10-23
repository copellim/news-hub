import "server-only";

import { parseHTML } from "linkedom";

import type { ReaderArticle } from "@/lib/reader-model";
import { fetchPage } from "@/lib/sources/http";
import { cleanHtml } from "../sanitize";
import type { Extractor } from "./extractor";

/** Id nuovi (`2610.28027v2`) e vecchi (`hep-th/9901001`). */
const ARXIV_ID_PATTERN =
  /^\/(?:abs|html|pdf)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)/;

/**
 * Di un paper la card mostra l'abstract e rimanda al testo intero: leggere un
 * paper di quaranta pagine in una card non è lettura rapida. Basta la pagina
 * `abs`, che dice anche se arXiv ha la versione HTML (non tutti i paper ce
 * l'hanno: 17 su 20 in un campione di cs.LG); senza, il rimando è al PDF.
 */
export const arxivExtractor: Extractor = {
  id: "arxiv",
  matches: (url) => arxivIdOf(url) !== null,
  async extract(url) {
    const id = arxivIdOf(url) as string;
    const page = await fetchPage("arxiv", `https://arxiv.org/abs/${id}`);
    return paperFromAbstractPage(page.html ?? "", url.href, id);
  },
};

export function arxivIdOf(url: URL): string | null {
  if (url.hostname !== "arxiv.org" && url.hostname !== "www.arxiv.org") {
    return null;
  }
  return ARXIV_ID_PATTERN.exec(url.pathname)?.[1] ?? null;
}

export function paperFromAbstractPage(
  html: string,
  sourceUrl: string,
  id: string,
): ReaderArticle {
  const { document } = parseHTML(html) as unknown as { document: Document };
  const abstract = withoutDescriptor(document.querySelector("blockquote.abstract"));
  const title = withoutDescriptor(document.querySelector("h1.title"));
  const authors = withoutDescriptor(document.querySelector(".authors"));
  const htmlVersion = document
    .querySelector("a#latexml-download-link")
    ?.getAttribute("href");

  return {
    status: "ready",
    title: textOf(title),
    byline: textOf(authors),
    siteName: "arXiv",
    publishedAt: null,
    html: cleanHtml(
      `<p>${abstract?.innerHTML.trim() ?? ""}</p>`,
      `https://arxiv.org/abs/${id}`,
    ),
    sourceUrl,
    extractor: "arxiv",
    paper: {
      key: `arxiv:${id.replace(/v\d+$/, "")}`,
      fullTextUrl: htmlVersion
        ? new URL(htmlVersion, "https://arxiv.org/").href
        : `https://arxiv.org/pdf/${id}`,
      fullTextFormat: htmlVersion ? "html" : "pdf",
    },
  };
}

/** arXiv apre titolo, autori e abstract con un'etichetta ("Abstract:") che qui non serve. */
function withoutDescriptor(element: Element | null): Element | null {
  element?.querySelector(".descriptor")?.remove();
  return element;
}

function textOf(element: Element | null): string | null {
  return element?.textContent?.replace(/\s+/g, " ").trim() || null;
}
