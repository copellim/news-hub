import { getSignedInEmail } from "@/lib/auth";
import { getArticle } from "@/lib/reader";

/**
 * L'articolo di un item per la card di lettura. Route GET e non Server Action:
 * le Server Action di una pagina girano una alla volta, e sulla corsia Papers
 * la card aspetterebbe dietro i lotti dei riassunti.
 */
export async function GET(request: Request): Promise<Response> {
  const email = await getSignedInEmail();
  if (!email) {
    return Response.json({ error: "Serve l'accesso" }, { status: 401 });
  }
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return Response.json({ error: "Manca la chiave" }, { status: 400 });
  }
  const article = await getArticle(key, email);
  if (!article) {
    return Response.json({ error: "Articolo sconosciuto" }, { status: 404 });
  }
  return Response.json(article);
}
