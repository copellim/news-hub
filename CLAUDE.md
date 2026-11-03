# news-hub — CLAUDE.md

@AGENTS.md

Aggregatore a uso personale, deployato su Vercel (piano Hobby). Tre pagine:
**News** (Hacker News, Lobsters, r/programming), **Papers** (HF Daily Papers,
arXiv filtrato, con un riassunto in italiano per paper) e **Da leggere** (coda
di segnalibri). Con l'accesso, articoli e commenti si leggono in una card senza
uscire dal portale. Login Google ristretto a un'allowlist di email; nessun
database: le pagine sono statiche con cache per fonte, lo stato degli utenti e
i riassunti stanno su Vercel Blob.

Va tenuto semplice: lo usano una o due persone. Un solo servizio di storage
(Blob), niente architetture pensate per un traffico che non c'è.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4,
`fast-xml-parser` per l'RSS di arXiv, Better Auth (Google, stateless),
`@vercel/blob`, `@anthropic-ai/sdk` (Claude Haiku 5.5), `@mozilla/readability`
+ `linkedom` + `sanitize-html` per la lettura diretta. Package manager: pnpm.
Verifiche: `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest, solo i moduli
puri della lettura diretta, con fixture ridotte da risposte reali).

## Caching — la regola portante

`cacheComponents: true` in `next.config.ts`. Ogni fetcher è una funzione con
`"use cache"` + `cacheLife` propria, perché le fonti hanno ritmi diversi:

| Fonte      | `cacheLife` | Perché |
|------------|-------------|--------|
| HN, Lobsters, Reddit | `minutes` | front page che gira di continuo |
| HF Daily   | `hours`     | selezione umana, una volta al giorno |
| arXiv      | `hours`     | il feed si aggiorna a mezzanotte ET e salta il weekend; con `days` un feed scaricato poco prima dell'aggiornamento resterebbe un giorno intero |

Non c'è un refresh manuale, ma c'è un controllo di freschezza nel client.
Tutte le cache sono stale-while-revalidate, pagina ISR compresa: con una o due
persone quasi ogni visita è la prima dopo una pausa e riceve la copia vecchia
mentre quella nuova si prepara (verificato su Vercel: `x-vercel-cache: STALE`,
poi `HIT` con `age: 3` quattro secondi dopo). Per questo ogni fetcher
restituisce anche `fetchedAt`, l'ora in cui ha scaricato davvero, e la corsia
la porta in `Lane.fetchedAt`. Il `FeedBoard`, al montaggio e al ritorno sulla
scheda, confronta l'età con `REFRESH_AFTER_MS` di `feed.ts`. Se i dati sono
vecchi richiama `loadLane` e riprova un paio di volte a distanza di pochi
secondi, finché non arriva la copia rigenerata. L'età si misura con l'ora del
server restituita da `loadLane`, così un orologio del telefono sbagliato non
fa richiedere la corsia all'infinito.

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
src/lib/summaries/          # server: JSONL dei riassunti, riassunti dei paper interi, generazione con Haiku
src/lib/paper-summaries.ts  # client: usePaperSummaries
src/lib/reader-model.ts     # client-safe: ReaderArticle, Discussion, Comment
src/lib/reader/             # server: estrattori, adapter dei commenti, sanitizer, whitelist
src/lib/reader-content.ts   # client: useReaderArticle, useReaderDiscussion
src/app/actions.ts          # Server Action: loadLane, riassunti
src/app/api/auth/[...all]/  # route di Better Auth
src/app/api/settings/       # GET/POST dello stato dell'utente loggato
src/app/api/reader/         # GET articolo e GET commenti per la card
src/app/page.tsx            # corsia News
src/app/papers/page.tsx     # corsia Papers
src/app/da-leggere/page.tsx # coda di lettura
```

Confine server/client: `sources/`, `summaries/`, `reader/`, `auth.ts`,
`blob-store.ts` e `user-settings.ts` sono `server-only`. I tipi e le costanti che
servono anche ai componenti stanno in `feed.ts`, `config.ts`, `settings-model.ts`
e `reader-model.ts`, che non importano nulla di `node:*`.

## Variabili d'ambiente

Vivono nel progetto Vercel `news-hub`, non a mano in `.env.local`: in locale si
scaricano con `vercel env pull .env.local --environment development`, che
riscrive il file per intero. Il pull va rifatto quando scade `VERCEL_OIDC_TOKEN`
(qualche ora): senza, Blob risponde 403. Elenco e significato in `.env.example`.

## Decisioni da non ribaltare senza motivo

- **Papers parte da Equilibrato.** Alterna HF e arXiv dentro ogni fascia di
  qualità, anche dopo la partizione dei verdetti; i voti servono soltanto a
  ordinare dentro HF. Le News mantengono Più votati come default.
- **Ranking per posizione dentro la propria fonte (Più votati/Più discussi).** 1551 punti HN e 163 di
  Lobsters non sono la stessa unità, ma "terzo su 50 di HN" e "secondo su 25
  di Lobsters" sì: si ordina sulla quota della fonte che l'item ha sotto di sé
  (`rankWithinSource` e `topShareOf` in `src/lib/feed.ts`), a parità vince il
  più recente. Vale anche per "Più discussi" sui commenti. Prima si usava il
  rapporto con il massimo della fonte, ma un solo post virale schiacciava
  tutti gli altri della sua fonte. Il rapporto con il totale invece è
  scartato, perché premierebbe le fonti che restituiscono meno item. Le fonti
  senza punteggio (arXiv) restano fuori classifica e finiscono in fondo, in
  un gruppo con il suo titolo. Fra loro la data non ordina niente: arXiv data
  l'annuncio e non il paper (nel feed di cs.AI tutti i 370 item di un giorno
  hanno lo stesso `pubDate`), quindi resta l'ordine del feed. La riga mostra
  la barretta e "top N%", cioè il numero
  su cui la lista è ordinata: i punti grezzi saltano fra una fonte e l'altra,
  e senza quel numero l'ordine sembra casuale.
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
- **Le fasce "Ultime 24 ore" / "Prima" solo con "Più recenti".** Su una
  classifica la spezzerebbero: "Prima" ripartirebbe dalla cima dopo che la
  prima fascia era scesa. La barretta misura sempre il criterio
  dell'ordinamento scelto, punti o commenti.
- **Il periodo filtra prima di classificare.** Sulle News "Ultime 24 ore"
  toglie gli item più vecchi prima di `rankWithinSource`, così "i più votati
  di oggi" si confrontano fra loro. Settimana e mese non esistono perché le
  fonti danno solo la front page attuale: servirebbero fetcher nuovi.
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
- Chi non ha fatto l'accesso vede solo le liste di News e Papers: niente
  riassunti (né letti né generati), stelle o letti. L'app è personale e ogni
  funzione oltre la lista resta dietro l'accesso, anche quando non costa.

## Stato dell'utente: un file per utente su Blob

`users/<sha256 dell'email>/settings.json` sullo store privato `news-hub-blob`,
con la forma:

```jsonc
{ "version": 2, "paperScreening": true, "arxivCategories": [...], "bookmarks": [...], "visited": [...] }
```

`src/lib/settings.ts` è l'unico posto che parla con `/api/settings`. Espone tre
viste di dominio (`useBookmarks`, `useVisitedItems`, `useArxivCategories`) più
`useSettingsStatus` (`loading` / `signedOut` / `ready` / `error`). La versione corrente è 2: `normalizeSettings` migra esplicitamente v1
conservando i dati e attivando `paperScreening`. Cambi futuri richiedono una nuova
versione e una migrazione esplicita.

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
  dalla cache. Quella lettura chiede `accept-encoding: identity`: se la CDN
  comprime la risposta (brotli, già con un JSONL di 3 KB) l'ETag diventa debole,
  `W/"…"`, e `put` lo rifiuta sempre con "ETag mismatch". `head()` e `list()`
  danno l'ETag forte, `get()` compresso no (verificato).
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
- **Solo con l'accesso**, sia `readPaperSummaries` sia
  `generatePaperSummaries`: ogni riassunto è una chiamata a pagamento (Haiku
  5.5, ragionamento esteso spento, ~$0,0001 a paper), e anche leggere quelli
  pronti resta una funzione di chi ha l'account.
- **A lotti di 8, uno dopo l'altro** (`usePaperSummaries`): i primi compaiono in
  pochi secondi e un solo lotto alla volta riscrive il file. Prima di generare
  si rilegge il file dall'origine, così un riassunto appena salvato da un'altra
  scheda non si paga due volte.
- **Potatura a 30 giorni**: un paper più vecchio non torna nei feed. Il file
  resta intorno ai 2 MB e si scarica intero a ogni lettura.
- **`SUMMARY_PROMPT_VERSION`**: alzarlo fa rigenerare tutto al caricamento
  successivo. Un rifiuto o un testo tagliato non si salvano.

### Riassunto del paper intero

Nella card di un paper c'è "Riassumi il paper con l'AI": un riassunto in
cinque paragrafi (Problema, Idea, Metodo, Risultati, Limiti), **solo a
richiesta**, perché si paga.

- **Fonte**: il PDF di arXiv. Lo scarica il server e lo passa in base64, con
  un tetto di 20 MB per stare sotto i 32 MB della richiesta. Dare l'URL al
  modello nasconderebbe un errore di arXiv. Il PDF ha anche figure e tabelle,
  e c'è per tutti i paper, mentre l'HTML no.
- **Modello**: Haiku 5.5 con ragionamento adattivo a sforzo `medium`. Su un
  paper di 30 pagine: ~10 s e meno di un centesimo.
- **Un file per paper**, `paper-digests/<id>.json` su Blob, comune a tutti. Non
  sta in `summaries.jsonl`, che si scarica intero a ogni apertura di Papers:
  qualche centinaio di parole per paper lo gonfierebbe per testi letti solo
  aprendo la card. Si legge dall'origine, così un riassunto appena scritto
  compare alla prossima apertura.
- **Route `/api/reader/digest`**: GET legge, POST genera. POST rilegge prima di
  generare, così un doppio click non paga due volte. Accetta solo id arXiv
  nuovi, perché l'id diventa il nome del file.
- **`DIGEST_PROMPT_VERSION`**: alzarlo fa ricomparire il pulsante; un riassunto
  vecchio non si rigenera da solo.

## Lettura diretta

Con l'accesso, un click sul titolo o sui commenti apre una card (`ReaderSheet`):
bottom sheet modale su mobile, side sheet modale da `sm`, un `<dialog>` con
`showModal()`. Ha le tab "Articolo" e "Commenti". Ctrl/Cmd, Shift, Alt e il tasto
centrale aprono ancora il sito in una scheda nuova. Senza accesso il titolo
resta un link: anche le route rispondono 401.

- **Due registri, un modello.** Gli articoli passano da una lista ordinata di
  estrattori (`reader/extractors/`), dove vince il primo che riconosce l'URL:
  `arxiv`, poi `generic`. I commenti hanno un adapter per fonte
  (`reader/discussions/`). Tutti producono `ReaderArticle` o `Discussion` di
  `reader-model.ts`. Un sito nuovo è un file e una riga nella lista, prima del
  generico.
- **Niente parser per sito sugli articoli.** I link di HN e Lobsters portano a
  decine di domini diversi (45 su 49 nel campione verificato). Il generico è
  Readability su linkedom: sul campione ha letto 44 articoli su 49, GitHub
  compreso. Gli altri erano app o SPA (LessWrong), e sotto i 500 caratteri il
  risultato diventa `unavailable` con l'`og:description`. Niente iframe: 20
  siti su 49 lo bloccano con `X-Frame-Options` o `frame-ancestors`.
- **Di un paper solo l'abstract**, dalla pagina `abs`. La card ha due pulsanti:
  "Leggi il paper completo", che rimanda all'HTML di arXiv quando c'è
  (`a#latexml-download-link`; 17 paper su 20 in un campione di cs.LG) e
  altrimenti al PDF, e il riassunto del paper intero (vedi sopra). Il testo
  intero in una card non è lettura rapida.
- **Commenti**:
  - HN: l'albero da Algolia `items/<id>`, ma i suoi figli sono in ordine di id.
    L'ordine del primo livello viene dai `kids` di Firebase; i livelli sotto
    restano cronologici, perché ordinarli costerebbe una chiamata per commento.
  - Lobsters: `s/<id>.json`, una lista piatta già nell'ordine del sito.
  - HF: `api/papers/<id>?field=comments` (documentato nello spec OpenAPI di HF).
  - Reddit e arXiv non hanno adapter.
- **Un solo sanitizer** (`reader/sanitize.ts`) per tutto l'HTML esterno. Rende
  assoluti `href` e `src` rispetto all'URL finale, perché linkedom non lo fa, e
  apre i link fuori dalla card. Toglie `srcset`, stili e script, e tiene il
  MathML.
- **Whitelist.** Il client manda solo la chiave.
  - Discussioni: l'id va a un host fisso e basta validarne la forma.
  - Articoli: l'URL si ricava dall'id per i paper. Per le news si cerca nello
    snapshot in cache della sola fonte della chiave, poi nei segnalibri
    dell'utente (un articolo salvato può essere uscito dalla front page).
  - Nessun URL arriva dal client.
- **Route GET, non Server Action.** Le Server Action di una pagina girano una
  alla volta, e sulla corsia Papers la card aspetterebbe i lotti dei riassunti.
- **Cache**: `"use cache"` per URL con `cacheLife("days")` per gli articoli,
  `"minutes"` per le discussioni. Gli errori di rete non entrano in cache: il
  sito giù diventa un `unavailable` fuori cache. A runtime su Vercel la cache è
  in memoria per istanza: dopo un avvio a freddo si riscarica. Nel client
  `reader-content.ts` tiene le risposte per la durata della visita.
- **Il tasto indietro chiude la card.** All'apertura si aggiunge una voce con
  `history.pushState` (Next 16 lo supporta e ci affianca il suo stato), e
  chiudendo con Esc o con la X la si toglie. In `StrictMode` l'effetto non
  aggiunge la voce due volte.

## Filtro categorie della corsia Papers

`ARXIV_CATEGORY_CATALOG` contiene la tassonomia arXiv per gli archivi che
interessano l'app — Computer Science, Statistics, EESS: 50 categorie prese da
<https://arxiv.org/category_taxonomy>. È anche la **whitelist**: l'id arriva dal
client e finisce in un URL, quindi è validato sia nella Server Action sia in
`getCategoryFeeds`. Aggiungere math/physics = aggiungere righe al catalogo.

`getCategoryFeed` cacha **una voce per categoria**: cambiare selezione riusa i
feed già scaricati invece di rifare le richieste.

Le categorie si **alternano**, un paper a turno da ciascuna, prima del taglio a
`SOURCE_FETCH_LIMIT`. Concatenate, il taglio teneva solo la prima: cs.AI da
sola annuncia centinaia di paper al giorno, e cs.LG e cs.CL non comparivano.

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
entrambi significano "l'ho aperto", che si apra la card o il sito. Il titolo diventa grigio, nella riga compare
"letto", e l'interruttore "Solo non letti" lavora su questo.

Nel `FeedBoard` l'ordine è **periodo → ordina → filtra per letto → taglia per
fonte**: se si tagliasse prima, ogni fonte sprecherebbe le sue N posizioni su
articoli che il filtro sta per nascondere.

## Età relative

"16 ore fa", la fascia "Ultime 24 ore" e l'etichetta "Nuovo" dipendono dall'ora
corrente, quindi esistono solo dopo il montaggio (`useNow` in `src/lib/now.ts`,
`null` sul server). La pagina è prerenderizzata e servita dalla cache: un'età
calcolata nel render sarebbe congelata e darebbe un mismatch di idratazione.
Prima del montaggio la riga mostra la data assoluta.

## Stile: Material 3, una palette per sezione

L'interfaccia segue Material 3: ruoli colore, top app bar piccola (`AppBar`),
navigation bar su mobile e navigation rail da `sm` (lo stesso `LaneTabs`),
tab, pulsante segmentato, interruttore, filter chip, livelli di stato e onda
alla pressione. I font restano quelli scelti per la lettura, Instrument Sans e
Newsreader.

- **Niente titolone.** La sezione la dice già la navigazione: in cima resta
  una barra di una riga con il nome a 22 px, che quando la pagina scorre
  passa al tono del contenitore.
- **Palette per sezione.** News, Papers e Da leggere hanno ciascuna i propri
  ruoli M3, generati con `@material/material-color-utilities` da un colore
  sorgente. In chiaro fondi e neutri vengono dalla variante tonal spot e gli
  accenti dalla fidelity. In scuro i neutri di tonal spot (croma 6) facevano
  sembrare uguali le tre sezioni, quindi vengono da palette tonali con croma
  16, 22 e 32 ai toni M3 del tema scuro. I valori stanno in `globals.css`
  sotto `[data-section]`. Rigenerarli significa rifare il calcolo e
  ricontrollare i contrasti, non ritoccare un esadecimale a mano.
- **`data-section` sta solo in `SectionFrame`**, nel layout, e non nelle
  pagine: per via di `<Activity>` (sotto) la pagina precedente resta nel DOM,
  e due sezioni vive insieme si contenderebbero i colori. Il `surface` di ogni
  sezione è ripetuto in `src/lib/sections.ts`, perché `viewport.themeColor`
  vuole valori letterali.
- **Le regole globali stanno nei layer di Tailwind** (`base`, `components`):
  fuori dai layer vincerebbero sulle classi di utilità.
- **Onda di pressione**: `spawnRipple` in `src/components/ripple.ts` aggiunge
  il cerchio dentro un contenitore `data-ripple-host` che React renderizza
  vuoto, così la riconciliazione non lo tocca. Con il movimento ridotto non
  parte.

## Nota su Next 16: `<Activity>`

Dopo una navigazione client la route precedente **resta nel DOM** con
`display: none` (React `<Activity>`, serve per il "back" istantaneo). Non è un
bug e non è DOM orfano: i test end-to-end devono scopare i selettori sulla
pagina visibile, altrimenti pescano elementi nascosti e i click falliscono per
ambiguità.

## Scrematura scientifica

`src/lib/paper-quality/` separa metadati, analisi AI del PDF, regole di
selezione e persistenza JSONL su Blob. La route `/api/papers/screen` lavora
su due paper alla volta, autenticati e presenti nei feed del server.
`useScreening` alimenta progressivamente la pagina Papers: filtro attivo di
default, interruttore salvato nell'account; Consigliati e Da valutare restano visibili,
solo gli Esclusi sono nella sezione espandibile. I lotti alternano HF e arXiv.
Il prompt metodologico v2 distingue limiti, informazioni mancanti e difetti
sostanziali (questi ultimi richiedono riferimento e impatto sulla conclusione).
Le valutazioni v1 restano da valutare fino al riesame, senza riusarle come v2.
Dettagli delle regole, cache, fonti e limiti nel README, sezione Scrematura scientifica.
Le recensioni OpenReview possono richiedere una challenge interattiva (403):
si mantiene il venueid ufficiale quando disponibile, segnalando che le review
non sono state lette. Non aggirare la challenge e non dedurre rifiuti da errori.
