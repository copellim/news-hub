"use client";

/**
 * Scarica un file generato in pagina. La revoca dell'object URL è differita:
 * revocarla nello stesso tick del `click()` annulla il download prima che il
 * browser abbia letto il blob.
 */
export function downloadTextFile(
  fileName: string,
  contents: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const JSONL_MIME_TYPE = "application/x-ndjson;charset=utf-8";
