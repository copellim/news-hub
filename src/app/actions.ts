"use server";

import { getSignedInEmail } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob-store";
import { isKnownArxivCategory } from "@/lib/config";
import type { Lane, LaneId } from "@/lib/feed";
import { getLane, getPaperTexts, type PaperText } from "@/lib/sources";
import {
  isSummarizerConfigured,
  SUMMARY_PROMPT_VERSION,
  summarizePaper,
} from "@/lib/summaries/generate";
import {
  readCachedSummaries,
  readLatestSummaries,
  saveSummaries,
  type SummaryRecord,
} from "@/lib/summaries/store";

/**
 * Reloads the lane with the categories chosen on the page. The server render
 * does not know the user's state and always starts from the defaults: this is the
 * way the client aligns the data with its own settings.
 *
 * It does not invalidate the cache: the feeds already have a `cacheLife` per source,
 * and changing a category is not a reason to download them again.
 *
 * It also returns the server time: the age of the data is measured against it,
 * because a phone with its clock a few minutes ahead would see the data as
 * always old and would keep requesting it.
 */
export async function loadLane(
  lane: LaneId,
  categories: readonly string[],
): Promise<{ lane: Lane; serverNow: number }> {
  const loaded = await getLane(lane, {
    // Whitelist, not sanitisation: the category becomes part of a URL.
    arxivCategories: categories.filter(isKnownArxivCategory),
  });
  return { lane: loaded, serverNow: Date.now() };
}

/** A page shows at most 50 papers per source, two sources. */
const MAX_KEYS_PER_READ = 100;

/**
 * Few papers per call: the client sends the missing ones in batches, so the first
 * summaries appear within a few seconds instead of waiting for the whole page.
 */
const MAX_KEYS_PER_GENERATION = 8;

/**
 * Ready summaries for the given papers. Reading costs nothing, but
 * summaries remain a feature for those who signed in: the app is personal and
 * whoever passes by without an account sees only the lists.
 */
export async function readPaperSummaries(
  keys: readonly string[],
): Promise<Record<string, string>> {
  if (!isBlobConfigured() || !(await getSignedInEmail())) {
    return {};
  }
  return currentTexts(
    await readCachedSummaries(),
    paperKeysOf(keys, MAX_KEYS_PER_READ),
  );
}

/**
 * Generates the missing summaries and returns those of the given papers. Only
 * for signed-in users, because every summary is a paid call; and only
 * for papers present in the feeds, see `getPaperTexts`.
 */
export async function generatePaperSummaries(
  keys: readonly string[],
  categories: readonly string[],
): Promise<Record<string, string>> {
  if (
    !isBlobConfigured() ||
    !isSummarizerConfigured() ||
    !(await getSignedInEmail())
  ) {
    return {};
  }

  const requested = paperKeysOf(keys, MAX_KEYS_PER_GENERATION);
  // From the origin: the CDN might not yet have a summary just saved
  // by another tab, and redoing it would cost again.
  const stored = await readLatestSummaries();
  const missing = requested.filter(
    (key) => !isCurrent(stored.get(key)),
  );

  const papers = await getPaperTexts(
    missing,
    Array.isArray(categories) ? categories.filter(isKnownArxivCategory) : [],
  );
  const generated = await generateAll(papers);
  await saveSummaries(generated);

  for (const record of generated) {
    stored.set(record.key, record);
  }
  return currentTexts(stored, requested);
}

/** A failing paper does not stop the others: it will be retried at the next opening. */
async function generateAll(
  papers: readonly PaperText[],
): Promise<SummaryRecord[]> {
  const results = await Promise.allSettled(papers.map(summarizePaper));
  return results.flatMap((result, index) => {
    if (result.status === "rejected") {
      console.error(`Riassunto di ${papers[index].key} fallito`, result.reason);
      return [];
    }
    return result.value ? [result.value] : [];
  });
}

function currentTexts(
  records: Map<string, SummaryRecord>,
  keys: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const record = records.get(key);
      return isCurrent(record) ? [[key, record.text]] : [];
    }),
  );
}

function isCurrent(
  record: SummaryRecord | undefined,
): record is SummaryRecord {
  return record?.promptVersion === SUMMARY_PROMPT_VERSION;
}

/**
 * The keys come from the client and TypeScript types do not constrain it: only
 * arXiv paper strings, and in limited number.
 */
function paperKeysOf(keys: unknown, limit: number): string[] {
  if (!Array.isArray(keys)) {
    return [];
  }
  const paperKeys = keys.filter(
    (key): key is string => typeof key === "string" && key.startsWith("arxiv:"),
  );
  return [...new Set(paperKeys)].slice(0, limit);
}
