/** Le sezioni dell'app e la loro palette. Client-safe. */

export type SectionId = "news" | "papers" | "queue";

const SECTION_BY_PATH: Record<string, SectionId> = {
  "/": "news",
  "/papers": "papers",
  "/da-leggere": "queue",
};

export function sectionOfPath(pathname: string): SectionId {
  return SECTION_BY_PATH[pathname] ?? "news";
}

/**
 * Colore della barra del browser su mobile: il `surface` della sezione, lo
 * stesso di `[data-section]` in globals.css. Sta qui perché `viewport` vuole
 * valori letterali e non variabili CSS.
 */
export const SECTION_THEME_COLORS: Record<
  SectionId,
  { light: string; dark: string }
> = {
  news: { light: "#f4fbf8", dark: "#0e1513" },
  papers: { light: "#fbf8ff", dark: "#131318" },
  queue: { light: "#fff7fa", dark: "#171216" },
};

export function themeColorOf(section: SectionId) {
  const colors = SECTION_THEME_COLORS[section];
  return [
    { media: "(prefers-color-scheme: light)", color: colors.light },
    { media: "(prefers-color-scheme: dark)", color: colors.dark },
  ];
}
