"use client";

import { useEffect, useRef, useState } from "react";

import { generatePaperSummaries, readPaperSummaries } from "@/app/actions";

/** Must stay aligned with the Server Action's `MAX_KEYS_PER_GENERATION`. */
const GENERATION_BATCH_SIZE = 8;

/**
 * Summaries of the visible papers, only when signed in: without it, the Server
 * Actions would answer empty and are not even called. It first reads the ready
 * ones, then asks for the missing ones in batches, one after the other: so the
 * first ones appear right away and only one batch at a time rewrites the file on Blob.
 *
 * Each key is asked for only once per visit, even if the list changes
 * because of a filter: going back does not repeat the calls.
 */
export function usePaperSummaries(
  keys: readonly string[],
  categories: readonly string[],
  isSignedIn: boolean,
) {
  const [summaries, setSummaries] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const knownSummaries = useRef(new Map<string, string>());
  const readKeys = useRef(new Set<string>());
  const generationKeys = useRef(new Set<string>());

  // The dependencies are strings: arrays change identity on every render.
  const keysSignature = keys.join("|");
  const categoriesSignature = categories.join(",");

  useEffect(() => {
    const visibleKeys = keysSignature ? keysSignature.split("|") : [];
    const selectedCategories = categoriesSignature
      ? categoriesSignature.split(",")
      : [];

    function remember(found: Record<string, string>) {
      if (Object.keys(found).length === 0) {
        return;
      }
      for (const [key, text] of Object.entries(found)) {
        knownSummaries.current.set(key, text);
      }
      setSummaries(new Map(knownSummaries.current));
    }

    function setPending(batch: readonly string[], isPending: boolean) {
      if (batch.length === 0) {
        return;
      }
      setPendingKeys((current) => {
        const next = new Set(current);
        batch.forEach((key) =>
          isPending ? next.add(key) : next.delete(key),
        );
        return next;
      });
    }

    async function generateMissing() {
      const missing = visibleKeys.filter(
        (key) =>
          !knownSummaries.current.has(key) && !generationKeys.current.has(key),
      );
      missing.forEach((key) => generationKeys.current.add(key));
      // All pending from the start, not just the current batch: Server Actions
      // run one at a time, and the last batches start several seconds later.
      setPending(missing, true);

      for (let start = 0; start < missing.length; start += GENERATION_BATCH_SIZE) {
        const batch = missing.slice(start, start + GENERATION_BATCH_SIZE);
        try {
          remember(await generatePaperSummaries(batch, selectedCategories));
        } catch (error) {
          console.error("Riassunti non generati", error);
        } finally {
          setPending(batch, false);
        }
      }
    }

    async function load() {
      if (!isSignedIn) {
        return;
      }
      const unread = visibleKeys.filter((key) => !readKeys.current.has(key));
      unread.forEach((key) => readKeys.current.add(key));
      if (unread.length > 0) {
        try {
          remember(await readPaperSummaries(unread));
        } catch (error) {
          console.error("Riassunti non letti", error);
        }
      }
      await generateMissing();
    }

    void load();
  }, [keysSignature, categoriesSignature, isSignedIn]);

  return { summaries, pendingKeys };
}
