import "server-only";

import { parseHTML } from "linkedom";

import type { ReaderArticle } from "@/lib/reader-model";
import { fetchPage } from "@/lib/sources/http";
import { cleanHtml } from "../sanitize";
import type { Extractor } from "./extractor";

/** Id nuovi (`2610.28027v2`) e vecchi (`hep-th/9901001`). */
const ARXIV_ID_PATTERN =
  /^\/(?:abs|html|pdf)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)/;

/** Parti della pagina HTML di arXiv che non sono il paper. */
const ARXIV_CHROME_SELECTORS = [
  ".ltx_page_header",
  ".ltx_page_footer",
  ".ltx_title_document",
  ".ltx_authors",
  ".package-alerts",
  "nav",
  "button",
].join(", ");

/**
 * Il paper intero dall'HTML che arXiv genera con LaTeXML, formule in MathML
 * comprese. Non tutti i paper ce l'hanno (17 su 20 in un campione di cs.LG):
 * senza, resta l'abstract della pagina `abs`, con l'avviso.
 */
export const arxivExtractor: Extractor = {
  id: "arxiv",
  matches: (url) => arxivIdOf(url) !== null,
  async extract(url) {
    const id = arxivIdOf(url) as string;
    try {
      const page = await fetchPage("arxiv", `https://arxiv.org/html/${id}`);
      if (page.html) {
        return paperFromLatexml(page.html, url.href, page.finalUrl);
      }
    } catch (error) {
      console.info(`arXiv ${id} senza HTML, uso l'abstract`, error);
    }
    const abstractPage = await fetchPage("arxiv", `https://arxiv.org/abs/${id}`);
    return paperFromAbstractPage(abstractPage.html ?? "", url.href, id);
  },
};

export function arxivIdOf(url: URL): string | null {
  if (url.hostname !== "arxiv.org" && url.hostname !== "www.arxiv.org") {
    return null;
  }
  return ARXIV_ID_PATTERN.exec(url.pathname)?.[1] ?? null;
}

export function paperFromLatexml(
  html: string,
  sourceUrl: string,
  baseUrl: string,
): ReaderArticle {
  const { document } = parseHTML(html) as unknown as { document: Document };
  const article = document.querySelector("article.ltx_document");
  if (!article) {
    throw new Error("Pagina HTML di arXiv senza article.ltx_document");
  }
  const title = textOf(document.querySelector(".ltx_title_document"));
  const authors = textOf(document.querySelector(".ltx_authors .ltx_personname"));
  article
    .querySelectorAll(ARXIV_CHROME_SELECTORS)
    .forEach((element) => element.remove());

  return {
    status: "ready",
    title,
    byline: authors,
    siteName: "arXiv",
    publishedAt: null,
    html: cleanHtml(article.innerHTML, baseUrl),
    notice: null,
    sourceUrl,
    extractor: "arxiv",
  };
}

export function paperFromAbstractPage(
  html: string,
  sourceUrl: string,
  id: string,
): ReaderArticle {
  const { document } = parseHTML(html) as unknown as { document: Document };
  const abstract = document.querySelector("blockquote.abstract");
  abstract?.querySelector(".descriptor")?.remove();
  const title = document.querySelector("h1.title");
  title?.querySelector(".descriptor")?.remove();
  const authors = document.querySelector(".authors");
  authors?.querySelector(".descriptor")?.remove();

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
    notice: "arXiv non ha la versione HTML di questo paper: qui c'è solo l'abstract, il testo intero è nel PDF.",
    sourceUrl,
    extractor: "arxiv",
  };
}

function textOf(element: Element | null): string | null {
  return element?.textContent?.replace(/\s+/g, " ").trim() || null;
}
