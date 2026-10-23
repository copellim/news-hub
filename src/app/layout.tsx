import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";

import { AccountMenu } from "@/components/AccountMenu";
import { LaneTabs } from "@/components/LaneTabs";
import "./globals.css";

// Sezioni, titoli e interfaccia: un grottesco contemporaneo, asciutto, con
// aperture ampie che reggono anche a 13 px.
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
});

// Riassunti: serif editoriale disegnato per lo schermo, con l'asse delle
// dimensioni ottiche che lo tiene robusto a 18 px.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "news-hub",
  description: "Hacker News, Lobsters, r/programming e paper AI in una pagina",
};

// La barra del browser su mobile prende il colore dell'header in tutti e due i
// temi.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#14181b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${instrument.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-rule bg-surface sm:border-0">
          <div className="mx-auto flex w-full max-w-188 items-center gap-x-6 gap-y-2 px-5 pt-5 pb-4 sm:items-baseline sm:px-6 sm:pt-8 sm:pb-0">
            <LaneTabs />
            <div className="ml-auto">
              <AccountMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-188 grow px-3 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-2 sm:pt-5 sm:pb-20">
          {children}
        </main>
      </body>
    </html>
  );
}
