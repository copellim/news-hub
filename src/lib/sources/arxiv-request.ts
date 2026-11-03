import "server-only";
import { fetchText } from "./http";

// Una connessione alla volta, con almeno 3 s tra richieste alle fonti arXiv.
let queue: Promise<void> = Promise.resolve();
let lastStarted = 0;
export function fetchArxivText(url: string): Promise<string> {
  const pending = queue.then(async () => {
    const delay = Math.max(0, 3000 - (Date.now() - lastStarted));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastStarted = Date.now();
    return fetchText("arxiv", url);
  });
  queue = pending.then(() => undefined, () => undefined);
  return pending;
}
