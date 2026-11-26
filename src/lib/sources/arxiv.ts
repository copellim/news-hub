import "server-only";

import { XMLParser } from "fast-xml-parser";
import { parseHTML } from "linkedom";
import { cacheLife } from "next/cache";
import { ARXIV_CANDIDATE_LIMIT, isKnownArxivCategory } from "@/lib/config";
import type { FeedItem, SourceSnapshot } from "@/lib/feed";
import { fetchArxivText } from "./arxiv-request";

const ANNOUNCED_TYPES = new Set(["new", "cross"]);
const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === "item" });
type RssItem = { title: string; link: string; description: string; category: string | string[]; pubDate: string; "arxiv:announce_type"?: string; "dc:creator"?: string };
export type ArxivEntry = { item: FeedItem; abstract: string };
type CategoryFeed = { entries: ArxivEntry[]; fetchedAt: string; recent: boolean; warnings: string[] };

async function getCategoryFeed(category: string): Promise<CategoryFeed> {
  "use cache";
  cacheLife("hours");
  let entries: ArxivEntry[] = [];
  const warnings: string[] = [];
  try { entries = parseArxivRss(await fetchArxivText(`https://rss.arxiv.org/rss/${category}`)); }
  catch { warnings.push(`RSS ${category} non disponibile`); }
  const recent = entries.length < ARXIV_CANDIDATE_LIMIT;
  if (recent) {
    try {
      entries = uniqueEntries([...entries, ...parseArxivListing(await fetchArxivText(`https://arxiv.org/list/${category}/recent?skip=0&show=${ARXIV_CANDIDATE_LIMIT}`))]);
      // Less active categories may have fewer than 20 papers in the last week.
      const now = new Date();
      for (let monthsBack = 1; entries.length < ARXIV_CANDIDATE_LIMIT && monthsBack <= 3; monthsBack++) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
        const month = `${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
        entries = uniqueEntries([...entries, ...parseArxivListing(await fetchArxivText(`https://arxiv.org/list/${category}/${month}?skip=0&show=${ARXIV_CANDIDATE_LIMIT}`))]);
      }
    } catch { warnings.push(`Recupero dei paper recenti di ${category} incompleto`); }
  }
  if (!entries.length && warnings.length) throw new Error(warnings.join("; "));
  return { entries: uniqueEntries(entries).slice(0, ARXIV_CANDIDATE_LIMIT), fetchedAt: new Date().toISOString(), recent, warnings };
}

async function getPool(categories: readonly string[]) {
  const allowed = [...new Set(categories.filter(isKnownArxivCategory))];
  const results = await Promise.allSettled(allowed.map(getCategoryFeed));
  const feeds = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (allowed.length && !feeds.length) throw new Error("arXiv: impossibile recuperare RSS e liste recenti delle categorie selezionate");
  const entries: ArxivEntry[] = [];
  for (let index = 0; feeds.some((feed) => index < feed.entries.length); index++) {
    for (const feed of feeds) if (feed.entries[index]) entries.push(feed.entries[index]);
  }
  return {
    entries: uniqueEntries(entries).slice(0, ARXIV_CANDIDATE_LIMIT),
    fetchedAt: feeds.map((feed) => feed.fetchedAt).sort()[0] ?? new Date().toISOString(),
    notices: [
      ...(feeds.some((feed) => feed.recent) ? ["arXiv: integrati gli annunci RSS con le liste recenti ufficiali, includendo giorni precedenti."] : []),
      ...feeds.flatMap((feed) => feed.warnings),
      ...results.flatMap((result, index) => result.status === "rejected" ? [`Categoria arXiv ${allowed[index]} non disponibile`] : []),
    ],
  };
}

export async function getArxivSnapshot(categories: readonly string[]): Promise<SourceSnapshot> {
  const pool = await getPool(categories);
  // The margin is cut to 50 AFTER the deduplication with HF in getLane.
  return { items: pool.entries.map((entry) => entry.item), fetchedAt: pool.fetchedAt, notice: pool.notices.join(" · ") || undefined };
}

export async function getArxivTexts(categories: readonly string[], keys: readonly string[] = []): Promise<Map<string, { title: string; abstract: string }>> {
  const pool = await getPool(categories);
  const requested = new Set(keys);
  return new Map(await Promise.all(pool.entries.filter((entry) => requested.has(entry.item.key)).map(async (entry) => {
    const abstract = entry.abstract || await getAbstract(entry.item.key.slice(6)).catch(() => "");
    return [entry.item.key, { title: entry.item.title, abstract }] as const;
  })));
}

async function getAbstract(id: string): Promise<string> {
  "use cache";
  cacheLife("hours");
  if (!/^\d{4}\.\d{4,5}$/.test(id)) return "";
  const { document } = parseHTML(await fetchArxivText(`https://arxiv.org/abs/${id}`));
  return clean(document.querySelector('meta[name="citation_abstract"]')?.getAttribute("content") ?? document.querySelector("blockquote.abstract")?.textContent?.replace(/^\s*Abstract:\s*/, "") ?? "");
}

export function parseArxivRss(xml: string): ArxivEntry[] {
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem[] } } };
  if (!parsed.rss?.channel) throw new Error("RSS arXiv non valido");
  return (parsed.rss.channel.item ?? []).filter((entry) => ANNOUNCED_TYPES.has(entry["arxiv:announce_type"] ?? "new")).flatMap((entry) => {
    const id = entry.link?.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})(?:v\d+)?(?:$|[?#])/)?.[1];
    const date = new Date(entry.pubDate);
    if (!id || !entry.title || !Number.isFinite(date.getTime())) return [];
    const abstract = entry.description?.split("Abstract:").slice(1).join("Abstract:") || entry.description || "";
    return [{ item: makeItem(id, clean(entry.title), date.toISOString(), entry["dc:creator"]?.split(",")[0]?.trim() || null, [entry.category].flat().filter(Boolean).slice(0, 3)), abstract: clean(abstract) }];
  });
}

export function parseArxivListing(html: string): ArxivEntry[] {
  const { document } = parseHTML(html);
  const entries: ArxivEntry[] = [];
  let date: string | null = null;
  for (const node of document.querySelectorAll("h3, dt")) {
    if (node.tagName === "H3") {
      const text = node.textContent?.match(/\b\d{1,2} [A-Za-z]{3} \d{4}\b/)?.[0];
      const parsed = text ? Date.parse(`${text} 00:00:00 GMT`) : NaN;
      date = Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
      continue;
    }
    if (!date) continue;
    const dt = node;
    const link = dt.querySelector('a[title="Abstract"]')?.getAttribute("href");
    const id = link?.match(/^\/abs\/(\d{4}\.\d{4,5})(?:v\d+)?$/)?.[1];
    const dd = dt.nextElementSibling;
    if (!id || dd?.tagName !== "DD") continue;
    const titleNode = dd.querySelector(".list-title");
    titleNode?.querySelector(".descriptor")?.remove();
    const title = clean(titleNode?.textContent ?? "");
    if (!title) continue;
    const tags = [...(dd.querySelector(".list-subjects")?.textContent ?? "").matchAll(/\(([a-z-]+(?:\.[A-Za-z]+)?)\)/g)].map((match) => match[1]).slice(0, 3);
    entries.push({ item: makeItem(id, title, date, clean(dd.querySelector(".list-authors a")?.textContent ?? "") || null, tags), abstract: "" });
  }
  // A different HTML (challenge, error or markup change) must not become a silently empty source.
  if (!entries.length && !/No (?:articles|papers|entries)|No updates/i.test(document.querySelector("#dlpage")?.textContent ?? "")) throw new Error("Lista arXiv non riconosciuta");
  return entries;
}

function uniqueEntries(entries: ArxivEntry[]): ArxivEntry[] {
  const byKey = new Map<string, ArxivEntry>();
  for (const entry of entries) if (!byKey.has(entry.item.key)) byKey.set(entry.item.key, entry);
  return [...byKey.values()];
}
function clean(text: string): string { return text.replace(/\s+/g, " ").trim(); }
function makeItem(id: string, title: string, publishedAt: string, author: string | null, tags: string[]): FeedItem {
  return { key: `arxiv:${id}`, source: "arxiv", title, url: `https://arxiv.org/abs/${id}`, discussionUrl: null, score: null, commentCount: null, author, publishedAt, tags };
}
