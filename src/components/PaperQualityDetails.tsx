import { safeEvidenceUrl, verdictOf, type PaperQuality } from "@/lib/paper-quality/model";

const CRITERIA = { claims: "Affermazioni", validation: "Validazione", reproducibility: "Riproducibilità", limitations: "Limiti" };
const OUTCOMES = { supported: "supportato", weak: "debole", unknown: "non verificabile", na: "non pertinente" };
const LABELS = { selected: "Selezionato", excluded: "Escluso dalla selezione", unverified: "Da verificare" };

export function PaperQualityDetails({ paper }: { paper: PaperQuality }) {
  const { verdict, reason } = verdictOf(paper);
  return (
    <details className="w-full text-sm text-muted">
      <summary className="cursor-pointer py-1 font-semibold text-accent">
        {LABELS[verdict]} · {paper.publication === "verified" ? "pubblicazione verificata" : "peer review non verificata"}
      </summary>
      <div className="mt-2 flex max-w-[76ch] flex-col gap-3 rounded-xl border border-rule bg-surface p-3 leading-relaxed">
        <p>{reason}</p>
        {paper.venue && <p>Sede: {paper.venue}</p>}
        {paper.assessment && <>
          <p>{paper.assessment.contribution}</p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {paper.assessment.checks.map((check) => <li key={check.criterion}>
              <strong className="text-ink">{CRITERIA[check.criterion]}: {OUTCOMES[check.outcome]}.</strong>{" "}
              {check.detail} {check.reference && <span>({check.reference})</span>}
            </li>)}
          </ul>
          <p>Valutazione AI del PDF: aiuta la selezione, non certifica i risultati né l&apos;esecuzione del codice.</p>
        </>}
        {paper.citations !== null && <p>
          {paper.citations} citazioni{paper.citationPercentile !== null ? ` · percentile normalizzato ${Math.round(paper.citationPercentile * 100)}` : ""}. Dato informativo, non usato per escludere i paper recenti.
        </p>}
        <p>{paper.integrity === "unknown" ? "Controllo degli avvisi editoriali non disponibile." : paper.integrity === "no-notice-found" ? "Nessun avviso editoriale trovato nelle fonti consultate; copertura non esaustiva." : paper.integrity === "retracted" ? "Ritrattazione o ritiro editoriale segnalato." : "Avviso editoriale o ritiro del preprint da verificare."}</p>
        {paper.evidence.map((evidence, index) => {
          const url = safeEvidenceUrl(evidence.url);
          return <p key={index}>{url ? <a className="font-semibold text-accent underline" href={url} target="_blank" rel="noreferrer">{evidence.label}</a> : evidence.label}: {evidence.detail}</p>;
        })}
        {paper.warnings.length > 0 && <ul className="list-disc pl-5">{paper.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        <p className="text-xs">Verificato il {new Date(paper.checkedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}.</p>
      </div>
    </details>
  );
}
