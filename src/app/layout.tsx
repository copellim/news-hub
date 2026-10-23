import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";

import { AppBar } from "@/components/AppBar";
import { LaneTabs } from "@/components/LaneTabs";
import { SectionFrame } from "@/components/SectionFrame";
import { themeColorOf } from "@/lib/sections";
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

// La barra del browser su mobile prende il colore della pagina; ogni pagina
// dichiara quello della propria sezione.
export const viewport: Viewport = {
  themeColor: themeColorOf("news"),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${instrument.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="h-full font-sans">
        <SectionFrame>
          <LaneTabs />
          {/* Da `sm` la navigazione è una colonna fissa di 80 px a sinistra:
              il contenuto si centra nello spazio che resta. */}
          <div className="flex grow flex-col sm:pl-20">
            <AppBar />
            <main className="mx-auto w-full max-w-188 grow px-3 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-2 sm:pb-20">
              {children}
            </main>
          </div>
        </SectionFrame>
      </body>
    </html>
  );
}
