import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";

import { AppBar } from "@/components/AppBar";
import { LaneTabs } from "@/components/LaneTabs";
import { SectionFrame } from "@/components/SectionFrame";
import { themeColorOf } from "@/lib/sections";
import "./globals.css";

// Sections, titles and interface: a contemporary grotesque, spare, with
// wide apertures that hold up even at 13 px.
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
});

// Summaries: an editorial serif designed for the screen, with the optical
// size axis that keeps it sturdy at 18 px.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "news-hub",
  description: "Hacker News, Lobsters, r/programming e paper AI in una pagina",
};

// The browser bar on mobile takes the page colour; each page declares the
// one of its own section.
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
          {/* From `sm` the navigation is a fixed 80 px column on the left:
              the content is centred in the remaining space. */}
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
