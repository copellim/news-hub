import { FeedBoard } from "@/components/FeedBoard";
import { getLane } from "@/lib/sources";

export default async function PapersPage() {
  const lane = await getLane("papers");

  return (
    <div data-section="papers" className="flex flex-col gap-4">
      <p className="max-w-[66ch] px-1 text-sm leading-relaxed text-muted sm:px-4">
        Il feed arXiv non ha voti: con &laquo;Più votati&raquo; finisce sotto
        i paper HF, che invece li hanno. Con l&apos;accesso le categorie
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
