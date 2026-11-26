import "server-only";

import { parseHTML } from "linkedom";

import type { ReaderArticle } from "@/lib/reader-model";
import { fetchPage } from "@/lib/sources/http";
import { cleanHtml } from "../sanitize";
import type { Extractor } from "./extractor";

/** New (`2610.28027v2`) and old (`hep-th/9901001`) ids. */
const ARXIV_ID_PATTERN =
  /^\/(?:abs|html|pdf)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)/;

/**
 * For a paper the card shows the abstract and links to the full text: reading a
 * forty-page paper in a card is not quick reading. The `abs` page is
 * enough, and it also says whether arXiv has the HTML version (not all papers
 * have it: 17 out of 20 in a cs.LG sample); without it, the link is to the PDF.
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

/** arXiv opens title, authors and abstract with a label ("Abstract:") that is not needed here. */
function withoutDescriptor(element: Element | null): Element | null {
  element?.querySelector(".descriptor")?.remove();
  return element;
}

function textOf(element: Element | null): string | null {
  return element?.textContent?.replace(/\s+/g, " ").trim() || null;
}
