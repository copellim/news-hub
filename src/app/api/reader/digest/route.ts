import { getSignedInEmail } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob-store";
import { createPaperDigest, findPaperDigest } from "@/lib/summaries/digest";
import { isSummarizerConfigured } from "@/lib/summaries/generate";

/**
 * The whole-paper summary. GET reads the saved one, POST generates it if
 * missing: it is generated only on request, because it is a paid call, and once
 * saved it is valid for everyone. A route and not a Server Action for the same reason
 * as the card: Server Actions run one at a time, behind the list summaries.
 */

/** Only new-style arXiv ids: the id becomes the name of a file on Blob. */
const PAPER_KEY_PATTERN = /^arxiv:(\d{4}\.\d{4,5})$/;

export async function GET(request: Request): Promise<Response> {
  const checked = await checkRequest(request);
  if (checked instanceof Response) {
    return checked;
  }
  return Response.json({ digest: await findPaperDigest(checked.arxivId) });
}

export async function POST(request: Request): Promise<Response> {
  const checked = await checkRequest(request);
  if (checked instanceof Response) {
    return checked;
  }
  if (!isSummarizerConfigured()) {
    return Response.json({ error: "Manca ANTHROPIC_API_KEY" }, { status: 503 });
  }
  try {
    return Response.json({ digest: await createPaperDigest(checked.arxivId) });
  } catch (error) {
    console.error(`Riassunto del paper ${checked.arxivId} non generato`, error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

async function checkRequest(
  request: Request,
): Promise<{ arxivId: string } | Response> {
  if (!(await getSignedInEmail())) {
    return Response.json({ error: "Serve l'accesso" }, { status: 401 });
  }
  if (!isBlobConfigured()) {
    return Response.json({ error: "Storage non configurato" }, { status: 503 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const arxivId = PAPER_KEY_PATTERN.exec(key)?.[1];
  if (!arxivId) {
    return Response.json({ error: "Chiave di paper non valida" }, { status: 400 });
  }
  return { arxivId };
}
