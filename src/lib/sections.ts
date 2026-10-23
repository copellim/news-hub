/** Le sezioni dell'app e la loro palette. Client-safe. */

export type SectionId = "news" | "papers" | "queue";

export const SECTIONS: readonly { id: SectionId; href: string; label: string }[] = [
  { id: "news", href: "/", label: "News" },
  { id: "papers", href: "/papers", label: "Papers" },
  { id: "queue", href: "/da-leggere", label: "Da leggere" },
];

export function sectionOfPath(pathname: string): SectionId {
  return SECTIONS.find((section) => section.href === pathname)?.id ?? "news";
}

/**
 * Colore della barra del browser su mobile: il `surface` della sezione, lo
 * stesso di `[data-section]` in globals.css. Sta qui perché `viewport` vuole
 * valori letterali e non variabili CSS.
 */
const SECTION_THEME_COLORS: Record<SectionId, { light: string; dark: string }> =
  {
    news: { light: "#f4fbf8", dark: "#001714" },
    papers: { light: "#fbf8ff", dark: "#101223" },
    queue: { light: "#fff7fa", dark: "#1d0e1d" },
  };

export function themeColorOf(section: SectionId) {
  const colors = SECTION_THEME_COLORS[section];
  return [
    { media: "(prefers-color-scheme: light)", color: colors.light },
    { media: "(prefers-color-scheme: dark)", color: colors.dark },
  ];
}
