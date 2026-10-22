import { getSignedInEmail } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob-store";
import {
  parseSettingsOperation,
  type SettingsOperation,
} from "@/lib/settings-model";
import { readUserSettings, updateUserSettings } from "@/lib/user-settings";

/**
 * Stato dell'utente loggato. È una route e non una Server Action perché il
 * client salva anche alla chiusura della scheda, con `fetch(..., { keepalive })`.
 * L'utente viene sempre dalla sessione, mai dal corpo della richiesta.
 */

/** Il recupero dal localStorage è la richiesta più grossa: ~100 KB in pratica. */
const MAX_BODY_BYTES = 1_000_000;

export async function GET(): Promise<Response> {
  const email = await getSignedInEmail();
  if (!email) {
    return unauthorized();
  }
  if (!isBlobConfigured()) {
    return storageMissing();
  }
  return Response.json(await readUserSettings(email));
}

export async function POST(request: Request): Promise<Response> {
  const email = await getSignedInEmail();
  if (!email) {
    return unauthorized();
  }
  if (!isBlobConfigured()) {
    return storageMissing();
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Richiesta troppo grande" }, { status: 413 });
  }
  const operations = parseOperations(body);
  if (!operations) {
    return Response.json({ error: "Operazioni non valide" }, { status: 400 });
  }
  return Response.json(await updateUserSettings(email, operations));
}

/** Tutto o niente: un'operazione malformata rifiuta l'intero lotto. */
function parseOperations(body: string): SettingsOperation[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const raw = (parsed as { operations?: unknown })?.operations;
  if (!Array.isArray(raw)) {
    return null;
  }
  const operations = raw
    .map(parseSettingsOperation)
    .filter((operation): operation is SettingsOperation => operation !== null);
  return operations.length === raw.length ? operations : null;
}

function unauthorized(): Response {
  return Response.json({ error: "Accesso richiesto" }, { status: 401 });
}

function storageMissing(): Response {
  return Response.json(
    { error: "Storage Blob non configurato: manca BLOB_STORE_ID" },
    { status: 503 },
  );
}
