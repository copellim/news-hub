import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { LaneTabs } from "@/components/LaneTabs";
import { SettingsBackup } from "@/components/SettingsBackup";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "news-hub",
  description: "Hacker News, Lobsters, r/programming e paper AI in una pagina",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="font-mono text-sm font-semibold tracking-tight">
              news-hub
            </span>
            <LaneTabs />
            <div className="ml-auto">
              <SettingsBackup />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl grow px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
