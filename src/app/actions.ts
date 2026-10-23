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
 * Ricarica la corsia con le categorie scelte in pagina. Il render del server
 * non conosce lo stato dell'utente e parte sempre dai default: questa è la via
 * con cui il client allinea i dati alle proprie impostazioni.
 *
 * Non invalida la cache: i feed hanno già un `cacheLife` per fonte, e cambiare
 * una categoria non è un motivo per riscaricarli.
 *
 * Restituisce anche l'ora del server: l'età dei dati si misura contro questa,
 * perché un telefono con l'orologio avanti di qualche minuto vedrebbe dati
 * sempre vecchi e continuerebbe a richiederli.
 */
export async function loadLane(
  lane: LaneId,
  categories: readonly string[],
): Promise<{ lane: Lane; serverNow: number }> {
  const loaded = await getLane(lane, {
    // Whitelist, non sanificazione: la categoria diventa parte di un URL.
    arxivCategories: categories.filter(isKnownArxivCategory),
  });
  return { lane: loaded, serverNow: Date.now() };
}

/** Una pagina mostra al massimo 50 paper per fonte, due fonti. */
const MAX_KEYS_PER_READ = 100;

/**
 * Pochi paper per chiamata: il client manda i mancanti a lotti, così i primi
 * riassunti compaiono in pochi secondi invece di aspettare l'intera pagina.
 */
const MAX_KEYS_PER_GENERATION = 8;

/**
 * Riassunti già pronti per i paper indicati. Leggere non costa nulla, ma i
 * riassunti restano una funzione di chi ha fatto l'accesso: l'app è personale e
 * chi passa senza account vede solo le liste.
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
 * Genera i riassunti che mancano e restituisce quelli dei paper indicati. Solo
 * per chi è loggato, perché ogni riassunto è una chiamata a pagamento; e solo
 * per paper presenti nei feed, vedi `getPaperTexts`.
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
  // Dall'origine: la CDN potrebbe non avere ancora un riassunto appena salvato
  // da un'altra scheda, e rifarlo costerebbe di nuovo.
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

/** Un paper che fallisce non ferma gli altri: si riproverà alla prossima apertura. */
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
 * Le chiavi arrivano dal client e i tipi TypeScript non lo vincolano: solo
 * stringhe di paper arXiv, e in numero limitato.
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
