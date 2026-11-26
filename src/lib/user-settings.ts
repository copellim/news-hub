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

/** One JSON file per user: it is small (~100 KB) and always read whole. */
const SETTINGS_CONTENT_TYPE = "application/json";

/**
 * Read from the origin and not from the CDN: after a save from another
 * device the cache would serve the previous version for a minute.
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
 * Hash and not the plain email: the path becomes part of a URL, and
 * an email can contain characters that do not fit well there.
 */
function settingsPathOf(email: string): string {
  const digest = createHash("sha256").update(email).digest("hex");
  return `users/${digest}/settings.json`;
}

/**
 * A missing file is a new user; an unreadable file instead is an error:
 * treating it as empty would make the next save delete
 * bookmarks and read items.
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
