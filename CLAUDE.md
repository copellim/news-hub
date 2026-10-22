# news-hub — CLAUDE.md

@AGENTS.md

Aggregatore a uso personale, deployato su Vercel (piano Hobby). Tre pagine:
**News** (Hacker News, Lobsters, r/programming), **Papers** (HF Daily Papers,
arXiv filtrato, con un riassunto in italiano per paper) e **Da leggere** (coda
di segnalibri). Login Google ristretto a un'allowlist di email; nessun
database: le pagine sono statiche con cache per fonte, lo stato degli utenti e
i riassunti stanno su Vercel Blob.

Va tenuto semplice: lo usano una o due persone. Un solo servizio di storage
(Blob), niente architetture pensate per un traffico che non c'è.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4,
`fast-xml-parser` per l'RSS di arXiv, Better Auth (Google, stateless),
`@vercel/blob`, `@anthropic-ai/sdk` (Claude Haiku 5.5). Package manager: pnpm.

## Caching — la regola portante

`cacheComponents: true` in `next.config.ts`. Ogni fetcher è una funzione con
`"use cache"` + `cacheLife` propria, perché le fonti hanno ritmi diversi:

| Fonte      | `cacheLife` | Perché |
|------------|-------------|--------|
| HN, Lobsters, Reddit | `minutes` | front page che gira di continuo |
| HF Daily   | `hours`     | selezione umana, una volta al giorno |
| arXiv      | `days`      | il feed si aggiorna a mezzanotte ET e salta il weekend |

Non c'è più un refresh manuale: la freschezza dipende solo da questi tempi.

**Non** usare `export const revalidate` a livello di route: in Next 16 il
caching passa da `use cache`, e `fetch` non è più cachato di default.

## Struttura

```
src/lib/feed.ts             # client-safe: tipo FeedItem, dedup, ordinamento
src/lib/config.ts           # client-safe: filtro arXiv hardcoded, user-agent
src/lib/sources/http.ts     # fetch con user-agent + timeout, SourceError
src/lib/sources/<fonte>.ts  # un fetcher per fonte, `import "server-only"`
src/lib/sources/index.ts    # getLane, Promise.allSettled, getPaperTexts
src/lib/settings-model.ts   # client-safe: forma dello stato, operazioni, validazione
src/lib/settings.ts         # client: copia locale dello stato + salvataggi a lotti
src/lib/user-settings.ts    # server: un file JSON per utente su Blob
src/lib/blob-store.ts       # server: lettura e scrittura condizionale su Blob
src/lib/auth.ts             # server: Better Auth, allowlist, getSignedInEmail
src/lib/auth-client.ts      # client: authClient di Better Auth
src/lib/summaries/          # server: JSONL dei riassunti + generazione con Haiku
src/lib/paper-summaries.ts  # client: usePaperSummaries
src/app/actions.ts          # Server Action: loadLane, riassunti
src/app/api/auth/[...all]/  # route di Better Auth
src/app/api/settings/       # GET/POST dello stato dell'utente loggato
src/app/page.tsx            # corsia News
src/app/papers/page.tsx     # corsia Papers
src/app/da-leggere/page.tsx # coda di lettura
```

Confine server/client: `sources/`, `summaries/`, `auth.ts`, `blob-store.ts` e
`user-settings.ts` sono `server-only`. I tipi e le costanti che servono anche ai
componenti stanno in `feed.ts`, `config.ts` e `settings-model.ts`, che non
importano nulla di `node:*`.

## Variabili d'ambiente

Vivono nel progetto Vercel `news-hub`, non a mano in `.env.local`: in locale si
scaricano con `vercel env pull .env.local --environment development`, che
riscrive il file per intero. Il pull va rifatto quando scade `VERCEL_OIDC_TOKEN`
(qualche ora): senza, Blob risponde 403. Elenco e significato in `.env.example`.

## Decisioni da non ribaltare senza motivo

- **Ranking per punteggio normalizzato sul massimo della propria fonte.** 1551
  punti HN e 163 di Lobsters non sono la stessa unità, ma il rapporto con il
  massimo della fonte sì: `score / max(fonte)` in [0,1], a parità vince il più
  recente. `sortByRank` in `src/lib/feed.ts`. Le fonti senza punteggio (arXiv)
  valgono -1 e finiscono in fondo, ordinate per data.
  **Non** usare la posizione nativa della fonte come classifica: l'ordine di
  `daily_papers` di HF non è per upvote (verificato), darebbe un ranking finto.
- **Gli score assenti sono `null`, mai `undefined`.** Algolia omette `points` su
  qualche hit: con `undefined` il massimo della fonte diventa `NaN` e l'intera
  fonte scivola in fondo. Normalizzare con `?? null` nel `toFeedItem` di ogni
  fetcher e controllare con `typeof score !== "number"`.
- Per lo stesso motivo del ranking le due corsie restano pagine separate.
- **Ordinamento e numero per fonte sono stato client**, non parametri di rete:
  i fetcher scaricano sempre `SOURCE_FETCH_LIMIT` (50) e la pagina taglia. Così
  i controlli sono istantanei e le route restano prerenderizzate statiche.
- **Prima si ordina, poi si taglia per fonte** (`sortItems` → `takePerSource`):
  così ogni fonte contribuisce i suoi migliori N secondo il criterio scelto e
  non i primi N che ha restituito.
- **Dopo un caricamento client comanda quel risultato, non la prop.** La Server
  Action fa ripartire il render RSC, e quel render non conosce le categorie
  scelte in pagina: legarsi alla prop `lane` rimetterebbe i default subito dopo
  averli cambiati. Vedi `activeLane` in `FeedBoard.tsx`.
- **Nessun refresh manuale.** Non c'è pulsante "Aggiorna" e non ci sono
  `cacheTag`/`updateTag`: la freschezza viene solo dal `cacheLife` di ogni
  fetcher. Rimetterne uno significa rimettere anche i tag.
- **Dedup con la chiave `arxiv:<id>`.** `paper.id` di HF *è* l'id arXiv, quindi
  la chiave combacia esatta. Sul lato news la chiave è `<fonte>:<id nativo>`.
- **HN via Algolia, non Firebase.** `?tags=front_page` restituisce gli item già
  idratati in una chiamata; `topstories.json` dà solo id e costringe a un N+1.
- **arXiv via RSS, non via API.** I termini della API chiedono ~1 req/3s.
- **Una fonte giù non abbatte la corsia**: `Promise.allSettled` e l'errore
  compare in pagina con il nome della fonte.

## Reddit

Unica fonte che richiede credenziali. Anonimo non è utilizzabile da un server:
`www.reddit.com/r/programming.json` risponde **403** anche con user-agent
custom, e il feed RSS passa a **429** già alla seconda richiesta. Serve un'app
registrata su <https://www.reddit.com/prefs/apps> (tipo *script*) e OAuth
`client_credentials` verso `oauth.reddit.com`. Variabili nel progetto Vercel,
vedi `.env.example`. Senza credenziali la corsia resta vuota e la pagina lo dice.

## Non ancora fatto (deciso, rimandato)

- **OpenReview** come arricchimento (badge "accettato a ICLR, review 8/6/6" su un
  id arXiv), non come sorgente di lista: non ha un flusso cronologico sensato.
  Da riverificare: `api2.openreview.net` ha risposto 403 in test da CLI.
- **Riviste** (JMLR, Nature Machine Intelligence) in una terza corsia a bassa
  velocità: ~1-2 item a settimana, annegherebbero se mescolati ad arXiv.
  Attenzione: il feed Nature è RSS 1.0/RDF, non RSS 2.0.

## Login

Better Auth con il solo provider Google e **nessun database**: senza `database`
passa da sé alla modalità stateless, sessione in un cookie cifrato di 7 giorni.
Una sessione singola non si revoca; cambiare `BETTER_AUTH_SECRET` le chiude
tutte.

- **Allowlist in `ALLOWED_EMAILS`**, controllata due volte: nell'hook
  `databaseHooks.user.create.before` (l'adapter in memoria ricrea l'utente a
  ogni login, quindi l'hook vede gli accessi) e in `getSignedInEmail`, che è
  l'unica porta per Server Action e route. L'utente viene sempre dalla
  sessione, mai dal corpo della richiesta.
- **Le pagine restano statiche**: la sessione si legge solo nel client
  (`authClient.useSession`) e nelle route/Server Action, mai nel render.
- Chi non ha fatto l'accesso legge News e Papers con i riassunti già pronti, ma
  senza stelle, letti né generazione di riassunti nuovi.

## Stato dell'utente: un file per utente su Blob

`users/<sha256 dell'email>/settings.json` sullo store privato `news-hub-blob`,
con la forma:

```jsonc
{ "version": 1, "arxivCategories": [...], "bookmarks": [...], "visited": [...] }
```

`src/lib/settings.ts` è l'unico posto che parla con `/api/settings`. Espone tre
viste di dominio (`useBookmarks`, `useVisitedItems`, `useArxivCategories`) più
`useSettingsStatus` (`loading` / `signedOut` / `ready` / `error`). Cambiare la
forma dei dati richiede una `version: 2`, non una migrazione silenziosa.

- **Il client manda operazioni, non l'oggetto** (`SettingsOperation` in
  `settings-model.ts`): il server le applica all'ultima versione del file. Con
  l'oggetto intero, una scheda con una copia vecchia cancellerebbe quello che
  un'altra ha appena salvato. Client e server usano lo stesso `applyOperations`.
- **Salvataggi a lotti**: la pagina si aggiorna subito, le operazioni partono
  3 s dopo l'ultima e quando la scheda si nasconde (`fetch` con `keepalive`, per
  questo è una route e non una Server Action). Ogni salvataggio è un `put`, e
  il piano Hobby di Blob ne concede 2.000 al mese: superati, lo store resta
  bloccato 30 giorni.
- **Scrittura condizionale**: `updateBlobText` rilegge dall'origine
  (`useCache: false`) e scrive con `ifMatch` sull'ETag; su
  `BlobPreconditionFailedError` riparte. La CDN può servire la versione vecchia
  per circa un minuto dopo una sovrascrittura, quindi chi riscrive non legge mai
  dalla cache.
- **Snapshot stabile per identità.** `useSyncExternalStore` confronta gli
  snapshot con `===`: l'oggetto si sostituisce solo quando qualcosa cambia.
- **I segnalibri salvano l'item intero**, non il solo id: un articolo resta
  leggibile anche quando è uscito dalla front page.
- **I letti hanno un tetto** (`MAX_VISITED`, 2000): il file si riscrive intero
  a ogni salvataggio.
- **`normalizeSettings` scarta le voci non valide, non l'intero file**. Un file
  del tutto illeggibile invece è un errore e non viene trattato come vuoto,
  altrimenti il salvataggio successivo lo azzererebbe.
- **Recupero dal localStorage**: al primo caricamento con accesso, quello che la
  versione precedente teneva in `news-hub:settings:v1` si unisce all'account
  (`mergeLocal`: unione di segnalibri e letti) e la chiave si cancella. Si può
  togliere quando non servirà più. Non c'è più export/import: il backup è il
  file su Blob, scaricabile dalla dashboard Vercel.

## Riassunti dei paper

Un riassunto in italiano sotto ogni paper **visibile** della corsia Papers.
Tutti gli utenti condividono lo stesso file: `summaries.jsonl` su Blob, una riga
per paper (`key`, `text`, `origin`, `model`, `promptVersion`, `createdAt`).

- **Fonte del testo**: per HF si traduce l'`ai_summary` che l'API di HF fornisce
  già; per arXiv, o se HF non l'ha, si riassume l'abstract (il campo
  `description` dell'RSS). Abstract e `ai_summary` restano sul server: i fetcher
  li tengono nella stessa voce di cache dell'item, ma alla pagina arriva solo
  l'item.
- **Whitelist**: le Server Action ricevono solo chiavi, e `getPaperTexts` cerca
  i testi nei feed in cache. Una chiave che non compare nei feed non produce
  nulla, quindi nessuno può far riassumere un testo arbitrario.
- **Leggere è aperto a tutti, generare no**: `generatePaperSummaries` richiede
  l'accesso, perché ogni riassunto è una chiamata a pagamento (Haiku 5.5,
  ragionamento esteso spento, ~$0,0001 a paper).
- **A lotti di 8, uno dopo l'altro** (`usePaperSummaries`): i primi compaiono in
  pochi secondi e un solo lotto alla volta riscrive il file. Prima di generare
  si rilegge il file dall'origine, così un riassunto appena salvato da un'altra
  scheda non si paga due volte.
- **Potatura a 30 giorni**: un paper più vecchio non torna nei feed. Il file
  resta intorno ai 2 MB e si scarica intero a ogni lettura.
- **`SUMMARY_PROMPT_VERSION`**: alzarlo fa rigenerare tutto al caricamento
  successivo. Un rifiuto o un testo tagliato non si salvano.

## Filtro categorie della corsia Papers

`ARXIV_CATEGORY_CATALOG` contiene la tassonomia arXiv per gli archivi che
interessano l'app — Computer Science, Statistics, EESS: 50 categorie prese da
<https://arxiv.org/category_taxonomy>. È anche la **whitelist**: l'id arriva dal
client e finisce in un URL, quindi è validato sia nella Server Action sia in
`getArxivItems`. Aggiungere math/physics = aggiungere righe al catalogo.

`getCategoryEntries` cacha **una voce per categoria**: cambiare selezione riusa i
feed già scaricati invece di rifare le richieste.

**Non c'è un pulsante di refresh: ogni modifica applica da sola.** Il render del
server non sa chi è l'utente e usa sempre i default, quindi il `FeedBoard`
confronta la selezione persistita con quella con cui i dati mostrati sono stati
costruiti (`loadedSelection`) e, se differiscono, chiama `loadLane` — all'
apertura e a ogni chip cliccato.

`loadLane` **non invalida la cache**: i feed hanno già un `cacheLife` per fonte e
cambiare categoria non è un motivo per riscaricarli. Di conseguenza non esistono
più `cacheTag`/`updateTag`: la freschezza dipende solo da `cacheLife`.

Le risposte fuori ordine si scartano con un contatore di richiesta
(`latestRequest`): cliccando più chip di fila la prima risposta può tornare dopo
l'ultima e rimettere dati vecchi.

## Letto / non letto

Un click sul titolo **o sul link ai commenti** segna l'articolo come visitato —
entrambi significano "l'ho aperto". Il titolo sbiadisce, compare il chip
"letto", e il filtro `Tutti / Non letti / Letti` lavora su questo.

Nel `FeedBoard` l'ordine è **ordina → filtra per letto → taglia per fonte**: se
si tagliasse prima, ogni fonte sprecherebbe le sue N posizioni su articoli che
il filtro sta per nascondere.

## Nota su Next 16: `<Activity>`

Dopo una navigazione client la route precedente **resta nel DOM** con
`display: none` (React `<Activity>`, serve per il "back" istantaneo). Non è un
bug e non è DOM orfano: i test end-to-end devono scopare i selettori sulla
pagina visibile, altrimenti pescano elementi nascosti e i click falliscono per
ambiguità.
