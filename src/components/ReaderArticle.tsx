"use client";

import type { ReaderArticle as Article } from "@/lib/reader-model";
import { hostnameOf } from "@/lib/feed";

/**
 * L'articolo estratto, nello stesso serif dei riassunti. L'HTML arriva già
 * ripulito dal server (`cleanHtml`): qui si mostra e basta.
 */
export function ReaderArticle({ article }: { article: Article }) {
  if (article.status === "unavailable") {
    return <UnavailableArticle article={article} />;
  }

  // Sui comunicati stampa sito e autore spesso coincidono: una volta basta.
  const meta = [
    ...new Set([article.siteName ?? hostnameOf(article.sourceUrl), article.byline]),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="mx-auto flex max-w-[66ch] flex-col gap-4 px-5 pt-5 pb-16 sm:px-8">
      <header className="flex flex-col gap-1.5">
        {meta && <p className="text-sm text-muted">{meta}</p>}
        {article.title && (
          <h2 className="text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-pretty">
            {article.title}
          </h2>
        )}
      </header>
      {article.notice && (
        <p className="rounded-xl border border-warn-line bg-warn px-4 py-3 text-sm text-warn-ink">
          {article.notice}
        </p>
      )}
      <div
        className="reader-prose"
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
    </article>
  );
}

function UnavailableArticle({
  article,
}: {
  article: Extract<Article, { status: "unavailable" }>;
}) {
  return (
    <div className="mx-auto flex max-w-[66ch] flex-col items-start gap-4 px-5 pt-8 pb-16 sm:px-8">
      <p className="text-ink">{article.reason}</p>
      {article.excerpt && (
        <p className="font-serif text-lg leading-[1.6] text-prose">
          {article.excerpt}
        </p>
      )}
      {/* Pulsante tonale di M3: è l'unica azione utile rimasta. */}
      <a
        href={article.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="state-layer inline-flex h-10 items-center rounded-full bg-chip px-6 text-sm font-semibold text-chip-ink"
      >
        Apri sul sito
      </a>
    </div>
  );
}
