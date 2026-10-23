import "server-only";

import type { Discussion } from "@/lib/reader-model";
import { fetchHackerNewsDiscussion } from "./hackernews";
import { fetchHuggingFaceDiscussion } from "./huggingface";
import { fetchLobstersDiscussion } from "./lobsters";

/**
 * Un adapter per fonte, scelto dal prefisso della chiave. L'id finisce in un
 * URL di un host fisso, quindi basta che abbia la forma giusta: non serve
 * cercarlo nei feed. Le chiavi `arxiv:` vanno a HF, l'unica fonte paper con
 * commenti. Reddit non ha adapter.
 */
const ADAPTERS: readonly {
  prefix: string;
  idPattern: RegExp;
  fetchDiscussion: (id: string) => Promise<Discussion>;
}[] = [
  { prefix: "hackernews:", idPattern: /^\d{1,12}$/, fetchDiscussion: fetchHackerNewsDiscussion },
  { prefix: "lobsters:", idPattern: /^[a-z0-9]{1,12}$/, fetchDiscussion: fetchLobstersDiscussion },
  { prefix: "arxiv:", idPattern: /^\d{4}\.\d{4,5}$/, fetchDiscussion: fetchHuggingFaceDiscussion },
];

/** `null` se la chiave non è di una fonte con commenti o ha un id malformato. */
export function discussionFetcherFor(
  key: string,
): (() => Promise<Discussion>) | null {
  const adapter = ADAPTERS.find(({ prefix }) => key.startsWith(prefix));
  if (!adapter) {
    return null;
  }
  const id = key.slice(adapter.prefix.length);
  return adapter.idPattern.test(id) ? () => adapter.fetchDiscussion(id) : null;
}
