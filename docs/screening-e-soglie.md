# Scrematura scientifica: regole, soglie e pool

Questa nota raccoglie il funzionamento della scrematura della pagina Papers e
i numeri che la governano. I valori sono quelli del codice al momento della
scrittura: ognuno indica il file da cui viene, che resta la fonte autorevole.
Il confronto di taratura del prompt è in
[paper-screening-calibration.md](paper-screening-calibration.md).

## Interruttore e visibilità

L'interruttore **Scrematura scientifica** è attivo di default e la preferenza
si salva nell'account (`paperScreening` in `src/lib/settings-model.ts`).
Disattivandolo torna subito l'elenco completo, con gli stessi filtri di
categoria e lettura, e i lotti successivi non partono; le richieste già
ricevute dal server possono comunque terminare.

La lista mostra **Consigliati** in cima e **Da valutare** sotto. Solo gli
**Esclusi** stanno nella sezione espandibile, con motivazioni e fonti. I paper
in attesa di analisi, o con download e servizi non disponibili, restano
visibili tra quelli da valutare: un errore non produce mai un giudizio
negativo (`verdictOf` in `src/lib/paper-quality/model.ts`).

Con l'ordinamento **Valutazione scientifica** i candidati si raggruppano in
consigliati e da valutare, alternando HF e arXiv dentro ciascun gruppo; con
**Più recenti** restano in ordine cronologico.

## Quanti paper: pagina, pool di analisi, recupero

I numeri sono tre e non vanno confusi.

1. **In pagina**: 10 paper per fonte di default (`DEFAULT_PAPERS_PER_SOURCE`
   in `src/lib/config.ts`), selezionabili fra 10, 20, 30 e 50
   (`ITEMS_PER_SOURCE_OPTIONS`).
2. **Pool di analisi**: per ciascuna fonte, dopo il filtro di periodo e quello
   dei letti, si analizzano fino a `min(50, max(30, 3 × limite in pagina))`
   candidati (`candidateLimit` in `src/lib/paper-interest/model.ts`, usato in
   `src/components/FeedBoard.tsx`). Con 10 in pagina sono 30 per fonte, con 20
   o più si arriva a 50. Il pool vale anche con la personalizzazione spenta.
   Gli esclusi liberano posti fra gli altri candidati del pool, ma non si
   avviano analisi sostitutive oltre il pool. La tabella in pagina riporta il
   pool analizzato e il numero in attesa.
3. **Recupero dei metadati**: l'obiettivo minimo è 20 candidati distinti per
   fonte (`MIN_PAPERS_PER_SOURCE`), fino a 50 per fonte (`SOURCE_FETCH_LIMIT`).
   Se una fonte non arriva a 20 la pagina lo segnala, senza riempire con paper
   dell'altra (`src/lib/sources/index.ts`). I controlli sulla quantità
   precedono letti e scrematura: non garantiscono 20 consigliati né 20 non
   letti.

Aumentando il limite in pagina si richiedono soltanto le chiavi aggiuntive: i
risultati già ricevuti durante la visita si riusano anche dopo una riduzione
del limite, un cambio di ordinamento o lo spegnimento e la riaccensione della
scrematura. Cambiando categorie o aggiornando il feed si ricontrolla solo il
lotto corrente, con la cache del server.

## Recupero per fonte

Ogni fonte si recupera indipendentemente.

- **Hugging Face** integra la selezione del giorno con i sette giorni
  precedenti, uno alla volta, finché non ha 20 paper
  (`src/lib/sources/huggingface.ts`).
- **arXiv** legge gli RSS delle categorie scelte e, se gli annunci sono meno
  di 100 per categoria (`ARXIV_CANDIDATE_LIMIT`, il doppio di
  `SOURCE_FETCH_LIMIT`), integra dalla lista ufficiale `recent` e poi dalle
  liste mensili, fino a tre mesi indietro (`src/lib/sources/arxiv.ts`). Il
  margine di 100 si taglia a 50 solo dopo la deduplica con HF, così anche 50
  sovrapposizioni non azzerano il canale. Senza categorie arXiv selezionate il
  recupero arXiv resta spento.
- Le richieste ad arXiv sono serializzate e distanziate di almeno 3 secondi
  per worker (`src/lib/sources/arxiv-request.ts`), con cache oraria.
- Gli abstract mancanti delle voci prese dalle liste HTML si scaricano dalle
  pagine `abs` solo per chiavi richieste e già presenti nel pool, con cache
  oraria (`getArxivTexts` e `getAbstract`). Le liste mostrano la data
  dell'annuncio, non quella del download.

## I due controlli

Con l'accesso, ogni paper del pool passa per due controlli
(`src/lib/paper-quality/`).

**Fonti bibliografiche** (`metadata.ts`): arXiv e Semantic Scholar per
identità e DOI; Crossref per pubblicazione e avvisi editoriali (`update-to`:
ritrattazione, ritiro, rimozione, espressione di preoccupazione); OpenReview
per accettazioni e recensioni pubbliche; OpenAlex per le ritrattazioni
(`is_retracted`) e i dati citazionali, che non entrano nella selezione.

- Le sedi riconosciute sono elencate in `TRUSTED_VENUE` e
  `TRUSTED_OPENREVIEW`: il tipo Crossref da solo e la sola presenza su
  OpenReview non bastano. OpenReview usa il `venueid` ufficiale di
  accettazione e, quando sono accessibili, controlla anche le decisioni
  pubbliche. Workshop e submission rifiutate non diventano accettazioni della
  main track.
- Il matching usa l'id arXiv esatto oppure titolo e autore esatti. Crossref
  segue solo DOI espliciti e le relazioni registrate verso la versione
  pubblicata.
- Le recensioni OpenReview possono richiedere una challenge interattiva (403):
  si tiene il `venueid` quando disponibile e si segnala che le review non sono
  state lette. La challenge non si aggira e da un errore non si deduce un
  rifiuto.
- La copertura è incompleta: nessun avviso trovato non garantisce l'integrità.

**PDF completo** (`assess.ts`): Haiku 5.5 valuta affermazioni, validazione,
riproducibilità e limiti, distinguendo lavori empirici, teorici e survey. Ogni
giudizio sostanziale deve indicare una sezione, pagina o tabella. Le
recensioni pubbliche, quando recuperabili, entrano come contesto. I link agli
artefatti estratti dal PDF si controllano con le API pubbliche di GitHub,
Hugging Face e Zenodo (`artifacts.ts`); gli altri servizi restano dichiarazioni
non verificate. Disponibilità, contenuto vuoto e codice eseguito sono
distinti: il codice non viene eseguito e un repository pubblico non certifica
i risultati.

## Regole del verdetto

Le regole stanno in `verdictOf` (`src/lib/paper-quality/model.ts`), in
quest'ordine.

1. Ritrattazione segnalata da una fonte bibliografica: **escluso**.
2. Nessuna analisi del PDF disponibile, o analisi di una versione del prompt
   diversa dalla corrente: **da valutare**.
3. Un **difetto sostanziale** (esito `fatal`), con riferimento al PDF e
   spiegazione di come compromette una conclusione centrale: **escluso**.
4. Avviso di preoccupazione editoriale: **da valutare**.
5. Un aspetto incerto o debole: **da valutare**.
6. **Consigliato** quando affermazioni e validazione sono supportate, il
   lavoro non è di tipo `other`, e la riproducibilità è supportata o non
   pertinente; una pubblicazione verificata basta a compensare una
   riproducibilità limitata.
7. Tutto il resto: **da valutare**.

L'AI distingue quattro situazioni: evidenza adeguata, limite documentato,
informazione mancante e difetto sostanziale; solo l'ultima esclude. Assenza di
codice, modelli proprietari, dominio ristretto e pochi seed non sono difetti
sostanziali automatici. Una pubblicazione verificata aggiunge fiducia a una
riproducibilità limitata ma non riscatta una validazione insufficiente o un
difetto sostanziale. Nessuna selezione usa attinenza, upvote, stelle o soglie
di citazioni, e la valutazione non certifica prove matematiche.

Il prompt metodologico corrente è **v2** (`METHOD_VERSION`). Le valutazioni v1
restano leggibili nella cache per conservarne la storia, ma non producono
esclusioni né raccomandazioni: sono da valutare fino al riesame del PDF. La
versione si controlla sia nella freschezza del record sia nel riuso
dell'analisi.

## Ritmo, cache e persistenza

- Il client manda **due paper per richiesta** a `/api/papers/screen`, che
  rifiuta lotti più grandi, alternando HF e arXiv fin dal primo lotto quando
  entrambe le fonti hanno paper (`screeningOrder` e `use-screening.ts`). La
  prima visita può richiedere diversi minuti e consuma chiamate AI.
- I **metadati** sono in cache per paper (`getPaperMetadata`: rivalidazione
  dopo un'ora, scadenza dopo un giorno). Un record su Blob è fresco per un
  giorno, o per 15 minuti se contiene avvisi di errore (`isFresh` in
  `store.ts`).
- L'**analisi del PDF** si riusa fino a 30 giorni per la stessa revisione
  arXiv, le stesse recensioni, lo stesso titolo e la stessa versione del
  prompt (`screen.ts`). Una revisione nuova, recensioni nuove o un prompt
  nuovo invalidano il riuso al controllo successivo.
- I risultati stanno in `paper-quality.jsonl` su Blob, condivisi tra utenti,
  con scritture a lotti; i record non ricontrollati da 30 giorni si rimuovono
  a ogni scrittura. Si rivalutano solo i paper ancora nei feed: non è un
  archivio dei paper usciti.
- L'API accetta solo chiavi presenti nei feed del server, richiede login e
  Blob e non usa titoli o PDF forniti dal client. Senza login resta visibile il
  feed completo; senza configurazione AI la valutazione metodologica resta non
  disponibile. Le chiavi OpenAlex e Semantic Scholar sono opzionali ma
  consigliate per limitare i rate limit (vedi `.env.example`).

## Impostazioni

Le impostazioni passano da v1 a v2 con una migrazione esplicita che conserva
categorie, segnalibri e letti e attiva la scrematura (`normalizeSettings`).
Disattivare la scrematura è un'operazione a sé, così non sovrascrive le
modifiche di altre schede.

## Paper affini ai preferiti

`TYPESAFE_API_KEY` abilita il confronto con Jev (API TypeSafe,
`src/lib/paper-interest/`). Nella vista Valutazione scientifica l'interruttore
**Personalizza dai preferiti** controlla una preferenza salvata per account
(`paperPersonalization`, attiva di default).

- Si confrontano titolo e abstract dei candidati del pool con gli ultimi 12
  paper salvati fra i segnalibri; nessuna email va al modello. Senza abstract
  resta il solo titolo.
- I punteggi sono in cache con rivalidazione dopo un'ora e scadenza dopo un
  giorno, con una chiave che dipende dai candidati e dai preferiti
  (`rankInterests` in `jev.ts`); gli abstract usati per il confronto hanno una
  cache propria, rivalidata dopo un giorno.
- Le richieste a `/api/papers/interest` sono autenticate, accettano solo paper
  nei feed del server e al massimo 16 chiavi per lotto.
- Dentro ciascuna fascia, per ogni gruppo di cinque paper di una fonte, si
  riservano prima due posizioni ai primi candidati dell'ordine normale e poi
  se ne assegnano tre per affinità, con soglia 0,65 (`personalizePapers` in
  `model.ts`). Nei gruppi incompleti l'affinità prende al più il 60%
  arrotondato per difetto, quindi almeno il 40% resta alla scoperta. È spazio
  indipendente dal profilo, non una garanzia che gli argomenti siano diversi.
- Se nessun candidato di una fonte raggiunge la soglia, quella fonte resta
  nell'ordine normale; lo stesso accade senza preferiti, senza chiave o con un
  errore del servizio. L'ordinamento cronologico non si personalizza, e
  affinità e qualità scientifica restano separate.
