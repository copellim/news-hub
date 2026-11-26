"use client";

import { hostnameOf } from "@/lib/feed";
import { usePaperDigest } from "@/lib/reader-content";
import type { ReaderArticle as Article, PaperLinks } from "@/lib/reader-model";

/** "Problema: …" (Problem): the label with which the prompt opens each paragraph of the summary. */
const DIGEST_LABEL_PATTERN = /^([A-ZÀ-Ý][^:\n]{1,24}):\s+/;

const digestDate = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

/**
 * The extracted article, in the same serif as the summaries. The HTML arrives
 * already cleaned by the server (`cleanHtml`): here it is only shown. For a
 * paper there is only the abstract, with the link to the full text and the
 * summary on request.
 */
export function ReaderArticle({ article }: { article: Article }) {
  if (article.status === "unavailable") {
    return <UnavailableArticle article={article} />;
  }

  // On press releases site and author often coincide: once is enough.
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
      {article.paper && (
        <h3 className="mt-2 text-sm font-semibold text-muted">Abstract</h3>
      )}
      <div
        className="reader-prose"
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
      {article.paper && <PaperActions paper={article.paper} />}
    </article>
  );
}

function PaperActions({ paper }: { paper: PaperLinks }) {
  const { state, generate } = usePaperDigest(paper.key);

  return (
    <section className="mt-4 flex flex-col gap-5 border-t border-rule pt-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* M3 tonal button for the link, filled for the action that costs money. */}
        <a
          href={paper.fullTextUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="state-layer inline-flex h-10 items-center rounded-full bg-chip px-6 text-sm font-semibold text-chip-ink"
        >
          Leggi il paper completo ({paper.fullTextFormat === "html" ? "HTML" : "PDF"})
        </a>
        {(state.status === "missing" || state.status === "error") && (
          <button
            type="button"
            onClick={() => void generate()}
            className="state-layer inline-flex h-10 items-center rounded-full bg-accent px-6 text-sm font-semibold text-on-accent"
          >
            {state.status === "error" ? "Riprova il riassunto" : "Riassumi il paper con l'AI"}
          </button>
        )}
      </div>

      {state.status === "missing" && (
        <p className="text-sm text-muted">
          Il riassunto lo scrive Claude leggendo il PDF intero: ci vuole qualche
          decina di secondi, e poi resta salvato.
        </p>
      )}
      {state.status === "generating" && (
        <div className="flex flex-col gap-2">
          <div className="relative h-1 overflow-hidden rounded-full">
            <span className="linear-progress" role="progressbar" aria-label="Riassunto in corso" />
          </div>
          <p className="text-sm text-muted">
            Il riassunto si sta scrivendo: ci vuole qualche decina di secondi.
          </p>
        </div>
      )}
      {state.status === "error" && (
        <p className="text-sm text-warn-ink">Il riassunto non è riuscito: {state.message}</p>
      )}
      {state.status === "ready" && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted">Riassunto del paper intero</h3>
          <div className="reader-prose">
            {/* The text does not change once written: the index is a stable key. */}
            {state.digest.text.split(/\n\s*\n/).map((paragraph, index) => (
              <DigestParagraph key={index} text={paragraph.trim()} />
            ))}
          </div>
          <p className="text-xs text-muted">
            Scritto da {state.digest.model} il{" "}
            {digestDate.format(new Date(state.digest.createdAt))}, dal PDF del paper.
          </p>
        </div>
      )}
    </section>
  );
}

function DigestParagraph({ text }: { text: string }) {
  const match = DIGEST_LABEL_PATTERN.exec(text);
  if (!match) {
    return <p>{text}</p>;
  }
  // After the colon the model writes in lowercase; with the label in bold
  // followed by a full stop, the sentence restarts with a capital letter.
  const body = text.slice(match[0].length);
  return (
    <p>
      <strong className="font-sans font-semibold text-ink">{match[1]}.</strong>{" "}
      {body.charAt(0).toLocaleUpperCase("it") + body.slice(1)}
    </p>
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
      {/* M3 tonal button: it is the only useful action left. */}
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
