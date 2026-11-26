import { getSignedInEmail } from "@/lib/auth";
import { getArticle } from "@/lib/reader";

/**
 * The article of an item for the reading card. A GET route and not a Server Action:
 * a page's Server Actions run one at a time, and on the Papers lane
 * the card would wait behind the summary batches.
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
