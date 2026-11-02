import type { Viewport } from "next";

import { FeedBoard } from "@/components/FeedBoard";
import { themeColorOf } from "@/lib/sections";
import { getLane } from "@/lib/sources";

export const viewport: Viewport = { themeColor: themeColorOf("papers") };

export default async function PapersPage() {
  const lane = await getLane("papers");

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[66ch] px-1 text-sm leading-relaxed text-muted sm:px-4">
        La scrematura scientifica è attiva di default: verifica pubblicazione,
        avvisi editoriali e metodo sul PDF completo. Distingue consigliati, paper
        da valutare ed esclusi. Puoi disattivarla per vedere tutti i paper. Categorie e scrematura restano salvate
        nell&apos;account; i risultati delle analisi vengono riutilizzati.
      </p>
      <FeedBoard
        lane={lane}
        laneId="papers"
        emptyLabel="Nessun paper: arXiv non pubblica nel weekend, o nessuna categoria è selezionata."
      />
    </div>
  );
}
