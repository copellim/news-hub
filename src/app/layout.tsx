import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Literata } from "next/font/google";

import { AccountMenu } from "@/components/AccountMenu";
import { LaneTabs } from "@/components/LaneTabs";
import "./globals.css";

// Interfaccia, date e numeri: disegnato perché I/l/1 e 0/O non si confondano
// anche a 13-14 px.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
});

// Titoli e riassunti: serif pensato per la lettura lunga a schermo, con l'asse
// delle dimensioni ottiche che lo adatta da 15 a 28 px.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "news-hub",
  description: "Hacker News, Lobsters, r/programming e paper AI in una pagina",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${atkinson.variable} ${literata.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-rule bg-white sm:border-0">
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
