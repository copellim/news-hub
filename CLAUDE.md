# news-hub — CLAUDE.md

@AGENTS.md

Aggregatore personale, solo locale. Tre pagine: **News** (Hacker News, Lobsters,
r/programming), **Papers** (HF Daily Papers, arXiv filtrato) e **Da leggere**
(coda salvata nel browser). Nessun database e nessuna auth: le pagine sono
statiche con cache per fonte, lo stato dell'utente vive in localStorage.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4,
`fast-xml-parser` per l'RSS di arXiv. Package manager: pnpm.

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
src/lib/sources/index.ts    # getLane, Promise.allSettled
src/lib/settings.ts         # unico store localStorage + import/export
src/app/page.tsx            # corsia News
src/app/papers/page.tsx     # corsia Papers
src/app/da-leggere/page.tsx # coda di lettura
```

Confine server/client: tutto ciò che sta in `sources/` è `server-only`. I tipi e
le costanti che servono anche ai componenti stanno in `feed.ts` e `config.ts`,
che non importano nulla di `node:*`.

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
`client_credentials` verso `oauth.reddit.com`. Variabili in `.env.local`, vedi
`.env.example`. Senza credenziali la corsia resta vuota e la pagina lo dice.

## Non ancora fatto (deciso, rimandato)

- **OpenReview** come arricchimento (badge "accettato a ICLR, review 8/6/6" su un
  id arXiv), non come sorgente di lista: non ha un flusso cronologico sensato.
  Da riverificare: `api2.openreview.net` ha risposto 403 in test da CLI.
- **Riviste** (JMLR, Nature Machine Intelligence) in una terza corsia a bassa
  velocità: ~1-2 item a settimana, annegherebbero se mescolati ad arXiv.
  Attenzione: il feed Nature è RSS 1.0/RDF, non RSS 2.0.

## Stato nel browser: un oggetto solo

Una chiave versionata, `news-hub:settings:v1`, letta con `useSyncExternalStore`:

```jsonc
{ "version": 1, "arxivCategories": [...], "bookmarks": [...], "visited": [...] }
```

`src/lib/settings.ts` è l'unico posto che tocca localStorage. Espone `useSettings`
più tre viste di dominio (`useBookmarks`, `useVisitedItems`, `useArxivCategories`)
che scrivono tutte sullo stesso oggetto. Cambiare la forma dei dati richiede un
`:v2`, non una migrazione silenziosa.

- **Snapshot stabile per identità.** `useSyncExternalStore` confronta gli
  snapshot con `===`: senza la cache su `cachedRaw`/`cachedSettings` ogni parse
  creerebbe un oggetto nuovo e React entrerebbe in loop di render.
- **L'evento `storage` non scatta nella scheda che ha scritto**, quindi ogni
  scrittura emette anche `news-hub:settings-changed`. Senza, la stella cliccata
  non aggiornerebbe il contatore nella navigazione.
- **I segnalibri salvano l'item intero**, non il solo id: un articolo resta
  leggibile anche quando è uscito dalla front page.
- **I letti hanno un tetto** (`MAX_VISITED`, 2000): la lista cresce a ogni click
  e senza limite finirebbe per riempire la quota.
- **`normalizeSettings` scarta le voci non valide, non l'intero file**: un
  backup leggermente sporco non deve azzerare le impostazioni di chi lo importa.
  Le categorie sconosciute cadono perché il catalogo è la whitelist.
- **Export JSON, import che sovrascrive.** È un ripristino dell'oggetto intero,
  non una fusione. I due pulsanti stanno nell'header accanto alle tab, quindi
  funzionano da qualunque pagina. La revoca dell'object URL va differita: revocarla nello
  stesso tick del `click()` annulla il download prima che Chromium legga il blob.
- **`migrateLegacyKeys`** recupera una tantum le tre chiavi separate della
  versione precedente (`reading-queue`, `arxiv-categories`, `visited`). Si può
  togliere quando non servirà più.

## Filtro categorie della corsia Papers

`ARXIV_CATEGORY_CATALOG` contiene la tassonomia arXiv per gli archivi che
interessano l'app — Computer Science, Statistics, EESS: 50 categorie prese da
<https://arxiv.org/category_taxonomy>. È anche la **whitelist**: l'id arriva dal
client e finisce in un URL, quindi è validato sia nella Server Action sia in
`getArxivItems`. Aggiungere math/physics = aggiungere righe al catalogo.

`getCategoryItems` cacha **una voce per categoria**: cambiare selezione riusa i
feed già scaricati invece di rifare le richieste.

**Non c'è un pulsante di refresh: ogni modifica applica da sola.** Il render del
server non conosce il localStorage e usa sempre i default, quindi il `FeedBoard`
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
