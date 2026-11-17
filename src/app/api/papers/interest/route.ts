import { getSignedInEmail } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob-store";
import { isKnownArxivCategory } from "@/lib/config";
import { getLane } from "@/lib/sources";
import { readUserSettings } from "@/lib/user-settings";
import { rankInterests } from "@/lib/paper-interest/jev";

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  const email = await getSignedInEmail();
  if (!email) return Response.json({ error: "Accedi per personalizzare i paper." }, { status: 401 });
  if (!isBlobConfigured() || !process.env.TYPESAFE_API_KEY) return Response.json({ error: "Personalizzazione non disponibile: configura TYPESAFE_API_KEY e storage." }, { status: 503 });
  const text = await request.text();
  if (text.length > 16000) return Response.json({ error: "Richiesta troppo grande" }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }
  if (!body || !Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 16 || !body.keys.every((key: unknown) => typeof key === "string" && key.length < 150) ||
      !Array.isArray(body.categories) || body.categories.length > 50 || !body.categories.every(isKnownArxivCategory)) return Response.json({ error: "Candidati non validi" }, { status: 400 });
  try {
    const settings = await readUserSettings(email);
    const savedPapers = settings.bookmarks.filter((item) => item.source === "arxiv" || item.source === "huggingface").slice(0, 12);
    // The bookmark store flushes optimistically after three seconds. Never cache
    // a score for an old saved list under the client's newly updated profile.
    const signature = JSON.stringify(savedPapers.map(({ key, title, savedAt }) => ({ key, title, savedAt })));
    if (body.favorites && body.favorites !== signature) return Response.json({ error: "Preferiti in salvataggio: riprova tra poco.", retry: true }, { status: 409 });
    const favorites = settings.bookmarks.filter((item) => item.source === "arxiv" || item.source === "huggingface").slice(0, 12).map(({ key, title }) => ({ key, title }));
    const headers = { "Cache-Control": "private, no-store" };
    if (!favorites.length) return Response.json({ scores: {} }, { headers });
    const lane = await getLane("papers", { arxivCategories: body.categories });
    const keys = new Set<string>(body.keys);
    const candidates = lane.items.filter((item) => keys.has(item.key)).map(({ key, title }) => ({ key, title }));
    if (candidates.length !== keys.size) return Response.json({ error: "Paper usciti dal feed: ricarica la pagina." }, { status: 409 });
    return Response.json({ scores: await rankInterests(candidates, favorites) }, { headers });
  } catch {
    return Response.json({ error: "Personalizzazione non disponibile. Rimane l’ordinamento normale." }, { status: 502 });
  }
}
