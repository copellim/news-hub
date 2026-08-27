# news-hub

Aggregatore personale di news e paper. Cinque fonti, due corsie e una lista di
segnalibri, in un'app Next.js senza database e senza login: gira in locale e
tiene le sue preferenze nel browser.

| Pagina | Cosa mostra |
|---|---|
| **News** | Hacker News, Lobsters, r/programming |
| **Papers** | Hugging Face Daily Papers, arXiv |
| **Da leggere** | Gli articoli messi da parte con la stella |

## Avvio

Servono Node 20.9+ (lo richiede Next 16) e pnpm.

```bash
pnpm install
pnpm dev
```

L'app è su <http://localhost:3000>. Gli altri script sono `pnpm build`,
`pnpm start`, `pnpm lint`, `pnpm typecheck`.

### Reddit (opzionale)

Quattro fonti su cinque non richiedono nulla. Reddit sì: da un server le
richieste anonime non passano — `www.reddit.com/r/programming.json` risponde
**403** anche con user-agent custom, e il feed RSS passa a **429** già alla
seconda richiesta.

Serve un'app registrata su <https://www.reddit.com/prefs/apps> di tipo *script*,
poi in `.env.local`:

```bash
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
```

Conviene anche aggiungere il proprio username all'`USER_AGENT` in
`src/lib/config.ts`: Reddit raccomanda il formato
`piattaforma:app:versione (by /u/utente)`.

Senza credenziali la corsia r/programming resta vuota e la pagina lo dice: il
resto funziona.

## Come è fatto

**Le pagine sono statiche.** Ogni fonte è una funzione con `'use cache'` e un
`cacheLife` proprio, perché i ritmi sono diversi: minuti per le front page, ore
per la selezione di Hugging Face, giorni per arXiv (il feed si aggiorna una
volta al giorno e salta il weekend). Non c'è un pulsante di refresh: la
freschezza dipende solo da quei tempi.

**Una fonte giù non abbatte la corsia.** Le chiamate girano in
`Promise.allSettled` e l'errore compare in pagina con il nome della fonte.

**Il ranking normalizza il punteggio sul massimo della propria fonte.** 1551
punti su Hacker News e 163 su Lobsters non sono la stessa unità: sommarli non
significa niente, il rapporto con il massimo sì. Le fonti senza punteggio —
arXiv — finiscono in fondo. In alternativa c'è l'ordine per data.

**Dedup con l'id arXiv.** Il campo `paper.id` di Hugging Face *è* l'id arXiv,
quindi lo stesso paper che esce su entrambe le fonti collassa in una riga sola.

**Letto e da leggere.** Un click sul titolo o sui commenti segna l'articolo come
letto, e il filtro `Tutti / Non letti / Letti` lavora su quello. La stella lo
mette da parte salvando l'item intero, non il solo id: resta leggibile anche
quando è uscito dalla front page.

## Impostazioni

Categorie arXiv, segnalibri e articoli letti stanno in **un solo oggetto JSON**
in `localStorage`, sotto `news-hub:settings:v1`:

```jsonc
{ "version": 1, "arxivCategories": [...], "bookmarks": [...], "visited": [...] }
```

I pulsanti **Esporta** e **Importa** nell'header lo scaricano e lo ripristinano
per intero. L'import sovrascrive: è un ripristino, non una fusione. È anche
l'unico modo di portare i segnalibri su un altro browser, visto che
`localStorage` non lascia il computer.

Le categorie arXiv selezionabili sono le 50 di `cs`, `stat` ed `eess`, prese da
<https://arxiv.org/category_taxonomy>. Aggiungere math o physics significa
aggiungere righe a `ARXIV_CATEGORY_CATALOG` in `src/lib/config.ts`, niente
altro. La selezione si applica da sola, all'apertura e a ogni modifica.

## Struttura

```
src/lib/feed.ts             tipo FeedItem, dedup, ordinamento, filtri
src/lib/config.ts           catalogo categorie arXiv, tetti, user-agent
src/lib/settings.ts         unico store localStorage + import/export
src/lib/sources/            un fetcher per fonte, tutti server-only
src/app/                    le tre pagine e la Server Action
```

Note di architettura e decisioni prese: `CLAUDE.md`.
