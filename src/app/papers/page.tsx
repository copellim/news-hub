import { FeedBoard } from "@/components/FeedBoard";
import { getLane } from "@/lib/sources";

export default async function PapersPage() {
  const lane = await getLane("papers");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs opacity-60">
        Il feed arXiv non ha punteggi: ordinando per punti finisce sotto i
        paper HF, che invece hanno gli upvote. Con l&apos;accesso le categorie
        scelte restano salvate nell&apos;account, e i paper mostrati ricevono
        un riassunto in italiano.
      </p>
      <FeedBoard
        lane={lane}
        laneId="papers"
        emptyLabel="Nessun paper: arXiv non pubblica nel weekend, o nessuna categoria è selezionata."
      />
    </div>
  );
}
