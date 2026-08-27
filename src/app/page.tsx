import { FeedBoard } from "@/components/FeedBoard";
import { getLane } from "@/lib/sources";
import { hasRedditCredentials } from "@/lib/sources/reddit";

export default async function NewsPage() {
  const lane = await getLane("news");

  return (
    <div className="flex flex-col gap-4">
      {!hasRedditCredentials() && (
        <p className="rounded border border-black/10 bg-black/[0.03] px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.04]">
          <strong>r/programming è disattivata</strong>: mancano{" "}
          <code className="font-mono">REDDIT_CLIENT_ID</code> e{" "}
          <code className="font-mono">REDDIT_CLIENT_SECRET</code> in{" "}
          <code className="font-mono">.env.local</code>. Reddit rifiuta le
          richieste anonime da un server (403), serve un&apos;app registrata.
        </p>
      )}
      <FeedBoard
        lane={lane}
        laneId="news"
        emptyLabel="Nessuna news: tutte le fonti hanno risposto vuoto."
      />
    </div>
  );
}
