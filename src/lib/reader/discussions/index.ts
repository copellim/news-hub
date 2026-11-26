import "server-only";

import type { Discussion } from "@/lib/reader-model";
import { fetchHackerNewsDiscussion } from "./hackernews";
import { fetchHuggingFaceDiscussion } from "./huggingface";
import { fetchLobstersDiscussion } from "./lobsters";

/**
 * One adapter per source, chosen by the key's prefix. The id ends up in a
 * URL on a fixed host, so it only needs the right shape: there is no need to
 * look it up in the feeds. `arxiv:` keys go to HF, the only paper source with
 * comments. Reddit has no adapter.
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

/** `null` if the key is not from a source with comments or has a malformed id. */
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
