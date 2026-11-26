import { getSignedInEmail } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob-store";
import {
  parseSettingsOperation,
  type SettingsOperation,
} from "@/lib/settings-model";
import { readUserSettings, updateUserSettings } from "@/lib/user-settings";

/**
 * State of the signed-in user. It is a route and not a Server Action because the
 * client also saves when the tab closes, with `fetch(..., { keepalive })`.
 * The user always comes from the session, never from the request body.
 */

/** The recovery from localStorage is the biggest request: ~100 KB in practice. */
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

/** All or nothing: a malformed operation rejects the whole batch. */
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
