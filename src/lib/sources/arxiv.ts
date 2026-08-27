import "server-only";

import { XMLParser } from "fast-xml-parser";
import { cacheLife } from "next/cache";

import { isKnownArxivCategory, SOURCE_FETCH_LIMIT } from "@/lib/config";
import { dedupeByKey, type FeedItem } from "@/lib/feed";
import { fetchText } from "./http";

/**
 * RSS invece della API: i termini della API chiedono ~1 richiesta ogni 3s, il
 * feed è una sola chiamata per categoria e basta. Si aggiorna una volta al
 * giorno intorno a mezzanotte ET e salta il weekend — un feed vuoto di sabato
 * non è un guasto.
 */
const FEED_BASE_URL = "https://rss.arxiv.org/rss/";

/** `replace` sono revisioni di paper già annunciati: rumore in un feed di novità. */
const ANNOUNCED_TYPES = new Set(["new", "cross"]);

type RssItem = {
  title: string;
  link: string;
  description: string;
  category: string | string[];
  pubDate: string;
  "arxiv:announce_type"?: string;
  "dc:creator"?: string;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  // Un feed con un solo item non deve degenerare in oggetto invece che array.
  isArray: (name) => name === "item",
});

/**
 * Cache **per categoria**: la chiave è la sola categoria, così cambiare
 * selezione riusa i feed già scaricati invece di rifare le richieste. I feed
 * cambiano una volta al giorno.
 */
async function getCategoryItems(category: string): Promise<FeedItem[]> {
  "use cache";
  cacheLife("days");

  return fetchCategory(category);
}

export async function getArxivItems(
  categories: readonly string[],
): Promise<FeedItem[]> {
  // Seconda barriera oltre a quella della Server Action: la categoria finisce
  // in un URL, e questa funzione è raggiungibile anche da altri chiamanti.
  const allowed = categories.filter(isKnownArxivCategory);
  const perCategory = await Promise.all(allowed.map(getCategoryItems));

  // Le categorie si sovrappongono: lo stesso paper esce su cs.AI e cs.LG.
  return dedupeByKey(perCategory.flat()).slice(0, SOURCE_FETCH_LIMIT);
}

async function fetchCategory(category: string): Promise<FeedItem[]> {
  const xml = await fetchText("arxiv", `${FEED_BASE_URL}${category}`);
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: RssItem[] } };
  };
  const items = parsed.rss?.channel?.item ?? [];

  return items
    .filter((item) => ANNOUNCED_TYPES.has(item["arxiv:announce_type"] ?? "new"))
    .map(toFeedItem);
}

function toFeedItem(item: RssItem): FeedItem {
  const arxivId = arxivIdFromLink(item.link);
  return {
    key: `arxiv:${arxivId}`,
    source: "arxiv",
    title: item.title,
    url: item.link,
    discussionUrl: null,
    // arXiv non ha alcun segnale di popolarità: mostrarne uno finto ingannerebbe.
    score: null,
    commentCount: null,
    author: firstAuthor(item["dc:creator"]),
    publishedAt: new Date(item.pubDate).toISOString(),
    tags: [item.category].flat().slice(0, 3),
  };
}

function arxivIdFromLink(link: string): string {
  return link.replace(/^https?:\/\/arxiv\.org\/abs\//, "");
}

function firstAuthor(creator: string | undefined): string | null {
  if (!creator) {
    return null;
  }
  const [first] = creator.split(",");
  return first.trim() || null;
}
