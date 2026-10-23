import { getSignedInEmail } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob-store";
import { createPaperDigest, findPaperDigest } from "@/lib/summaries/digest";
import { isSummarizerConfigured } from "@/lib/summaries/generate";

/**
 * Il riassunto del paper intero. GET legge quello salvato, POST lo genera se
 * manca: si genera solo a richiesta, perché è una chiamata a pagamento, e una
 * volta salvato vale per tutti. Route e non Server Action per lo stesso motivo
 * della card: le Server Action girano una alla volta, dietro i riassunti della lista.
 */

/** Solo id arXiv nuovi: l'id diventa il nome di un file su Blob. */
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
