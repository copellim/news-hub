"use server";

import { isKnownArxivCategory } from "@/lib/config";
import type { Lane, LaneId } from "@/lib/feed";
import { getLane } from "@/lib/sources";

/**
 * Ricarica la corsia con le categorie scelte in pagina. Il render del server
 * non conosce il localStorage e parte sempre dai default: questa è la via con
 * cui il client allinea i dati alle proprie impostazioni.
 *
 * Non invalida la cache: i feed hanno già un `cacheLife` per fonte, e cambiare
 * una categoria non è un motivo per riscaricarli.
 */
export async function loadLane(
  lane: LaneId,
  categories: readonly string[],
): Promise<Lane> {
  return getLane(lane, {
    // Whitelist, non sanificazione: la categoria diventa parte di un URL.
    arxivCategories: categories.filter(isKnownArxivCategory),
  });
}
