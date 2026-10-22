import "server-only";

import { createHash } from "node:crypto";

import { readLatestBlobText, updateBlobText } from "@/lib/blob-store";
import {
  applyOperations,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Settings,
  type SettingsOperation,
} from "@/lib/settings-model";

/** Un file JSON per utente: è piccolo (~100 KB) e si legge sempre intero. */
const SETTINGS_CONTENT_TYPE = "application/json";

/**
 * Lettura dall'origine e non dalla CDN: dopo un salvataggio da un altro
 * dispositivo la cache servirebbe per un minuto la versione precedente.
 */
export async function readUserSettings(email: string): Promise<Settings> {
  return parseStoredSettings(await readLatestBlobText(settingsPathOf(email)));
}

export async function updateUserSettings(
  email: string,
  operations: readonly SettingsOperation[],
): Promise<Settings> {
  const written = await updateBlobText(
    settingsPathOf(email),
    SETTINGS_CONTENT_TYPE,
    (current) =>
      JSON.stringify(applyOperations(parseStoredSettings(current), operations)),
  );
  return parseStoredSettings(written);
}

/**
 * Hash e non l'email in chiaro: il percorso diventa parte di un URL, e
 * un'email può contenere caratteri che non ci stanno bene.
 */
function settingsPathOf(email: string): string {
  const digest = createHash("sha256").update(email).digest("hex");
  return `users/${digest}/settings.json`;
}

/**
 * Un file assente è un utente nuovo; un file illeggibile invece è un errore:
 * trattarlo come vuoto farebbe sì che il salvataggio successivo cancelli
 * segnalibri e letti.
 */
function parseStoredSettings(text: string | null): Settings {
  if (text === null) {
    return DEFAULT_SETTINGS;
  }
  const settings = normalizeSettings(JSON.parse(text));
  if (!settings) {
    throw new Error("Il file delle impostazioni su Blob non è riconoscibile");
  }
  return settings;
}
