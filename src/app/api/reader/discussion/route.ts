import { getSignedInEmail } from "@/lib/auth";
import { getDiscussion } from "@/lib/reader";

/** The comments of an item for the reading card; a GET route for the same reason as the article. */
export async function GET(request: Request): Promise<Response> {
  const email = await getSignedInEmail();
  if (!email) {
    return Response.json({ error: "Serve l'accesso" }, { status: 401 });
  }
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return Response.json({ error: "Manca la chiave" }, { status: 400 });
  }
  try {
    const discussion = await getDiscussion(key);
    if (!discussion) {
      return Response.json({ error: "Nessuna discussione per questa fonte" }, { status: 404 });
    }
    return Response.json(discussion);
  } catch (error) {
    console.error(`Discussione di ${key} non caricata`, error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
