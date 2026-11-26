/** The app's sections and their palette. Client-safe. */

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
 * Colour of the browser bar on mobile: the section's `surface`, the
 * same as `[data-section]` in globals.css. It lives here because `viewport` wants
 * literal values and not CSS variables.
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
