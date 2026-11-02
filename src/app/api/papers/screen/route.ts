import { getSignedInEmail } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob-store";
import { isKnownArxivCategory } from "@/lib/config";
import { PAPER_KEY } from "@/lib/paper-quality/model";
import { screenPapers } from "@/lib/paper-quality/screen";
import { getLane } from "@/lib/sources";

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  if (!(await getSignedInEmail())) return Response.json({ error: "Accedi per attivare la scrematura." }, { status: 401 });
  if (!isBlobConfigured()) return Response.json({ error: "Scrematura non disponibile: storage non configurato." }, { status: 503 });
  const text = await request.text();
  if (text.length > 8000) return Response.json({ error: "Richiesta troppo grande" }, { status: 413 });
  let body: { keys?: unknown; categories?: unknown };
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }
  if (!body || !Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 2 ||
      !body.keys.every((key) => typeof key === "string" && PAPER_KEY.test(key)) ||
      !Array.isArray(body.categories) || body.categories.length > 50 || !body.categories.every(isKnownArxivCategory)) {
    return Response.json({ error: "Paper o categorie non validi" }, { status: 400 });
  }
  try {
    // Paid work can only target papers currently present in the actual server-side feeds.
    const lane = await getLane("papers", { arxivCategories: body.categories });
    const keys = new Set(body.keys as string[]);
    const items = lane.items.filter((item) => keys.has(item.key));
    if (items.length !== keys.size) return Response.json({ error: "Paper usciti dal feed: ricarica la pagina." }, { status: 409 });
    return Response.json({ papers: await screenPapers(items) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Scrematura non completata", error instanceof Error ? error.name : "errore");
    return Response.json({ error: "Scrematura non disponibile. I paper non sono stati valutati." }, { status: 502 });
  }
}
