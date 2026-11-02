# news-hub

Aggregatore personale di news e paper. Cinque fonti, due corsie e una lista di
segnalibri, in un'app Next.js senza database, deployata su Vercel. Il login è
con Google, riservato a poche email; segnalibri, letti e riassunti stanno su
Vercel Blob.

| Pagina | Cosa mostra |
|---|---|
| **News** | Hacker News, Lobsters, r/programming |
| **Papers** | Hugging Face Daily Papers, arXiv, con un riassunto in italiano per paper |
| **Da leggere** | Gli articoli messi da parte con la stella |

## Avvio

Servono Node 20.9+ (lo richiede Next 16), pnpm e la CLI di Vercel collegata al
progetto (`vercel link`). Le variabili d'ambiente vivono sul progetto Vercel e
si scaricano in `.env.local`:

```bash
pnpm install
vercel env pull .env.local --environment development
pnpm dev
```

Il pull riscrive `.env.local` per intero e va rifatto quando scade il token
OIDC di Blob (qualche ora): il sintomo è un 403 da Blob. Elenco delle variabili
in `.env.example`.

L'app è su <http://localhost:3000>. Gli altri script sono `pnpm build`,
`pnpm start`, `pnpm lint`, `pnpm typecheck`.

### Reddit (opzionale)

Quattro fonti su cinque non richiedono nulla. Reddit sì: da un server le
richieste anonime non passano — `www.reddit.com/r/programming.json` risponde
**403** anche con user-agent custom, e il feed RSS passa a **429** già alla
seconda richiesta.

Serve un'app registrata su <https://www.reddit.com/prefs/apps> di tipo *script*,
con `REDDIT_CLIENT_ID` e `REDDIT_CLIENT_SECRET` nel progetto Vercel.

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

**Riassunti.** Sotto ogni paper visibile compare un riassunto in italiano: per
Hugging Face è la traduzione della frase che HF fornisce già, per arXiv è un
riassunto dell'abstract. Li genera Claude Haiku 5.5, solo per chi ha fatto
l'accesso, e si salvano in un unico `summaries.jsonl` su Blob, così non si
rielaborano a ogni apertura.

**Lettura diretta.** Con l'accesso, un click sul titolo apre l'articolo in una
card dentro il portale, con i commenti di HN, Lobsters e Hugging Face in una
seconda tab. L'articolo si estrae con Readability da qualsiasi sito; quello
che non si può leggere lì (un'app, un PDF) rimanda al sito. Di un paper la
card mostra l'abstract, il link al testo completo e, a richiesta, un riassunto
del paper intero scritto da Claude Haiku dal PDF e salvato su Blob per le volte
successive. Ctrl/Cmd+click apre ancora il sito in una scheda nuova.

## Scrematura scientifica

Nella pagina Papers l'interruttore **Scrematura scientifica** è attivo di
base. La preferenza si salva nell'account; disattivandola torna subito
l'elenco completo, con gli stessi filtri di categoria e lettura.

Con l'accesso, ogni paper dei feed correnti passa per due controlli:

- **Fonti bibliografiche**: arXiv e Semantic Scholar per identità e DOI,
  Crossref per pubblicazione e avvisi editoriali (compresi Retraction Watch),
  OpenReview per accettazioni e recensioni pubbliche, OpenAlex per
  ritrattazioni e citazioni contestualizzate.
- **PDF completo**: Haiku valuta affermazioni, validazione, riproducibilità
  e limiti, distinguendo lavori empirici, teorici e survey. Ogni giudizio
  sostanziale deve indicare una sezione, pagina o tabella. Le recensioni
  pubbliche, quando recuperabili, entrano come contesto nella valutazione.
  I link agli artefatti estratti dal PDF vengono controllati tramite le API
  pubbliche di GitHub, Hugging Face e Zenodo; altri servizi restano dichiarazioni
  non verificate. Disponibilità, contenuto vuoto e codice eseguito sono distinti:
  il codice non viene eseguito e un repository pubblico non certifica i risultati.

La lista mostra **Consigliati** in cima e **Da valutare** sotto. Solo gli
**Esclusi** restano nella sezione espandibile, con motivazioni e fonti.
Anche i paper in attesa di analisi o con download/servizi non disponibili
rimangono visibili tra quelli da valutare. I contatori distinguono i tre
esiti e le attese per ogni fonte, applicando il filtro dei letti ma prima
del limite per fonte. Il limite resta complessivo per fonte: prima prende i
consigliati, poi quelli da valutare, mantenendo l'ordinamento scelto dentro
ciascuna fascia.

L'AI distingue quattro situazioni: evidenza adeguata, **limite** documentato,
**informazione mancante** e **difetto sostanziale**. Solo quest'ultimo,
con riferimento al PDF e spiegazione di come compromette una conclusione
centrale, può causare esclusione. La ritrattazione resta motivo di esclusione;
un avviso di preoccupazione editoriale richiede valutazione. Assenza di codice,
modelli proprietari, dominio ristretto e pochi seed non sono difetti
sostanziali automatici. Il controllo di disponibilità degli artefatti resta
separato dalla valutazione metodologica.

Per essere consigliato servono affermazioni e validazione supportate e un
percorso di ricostruzione adeguato al contributo (anche non pertinente quando
motivato). Limiti riconosciuti non annullano automaticamente un contributo
solido. Una pubblicazione verificata aggiunge fiducia a una riproducibilità
limitata, ma non riscatta una validazione insufficiente o un difetto sostanziale.
Nessuna selezione usa attinenza, upvote, stelle o soglie di citazioni. La
valutazione AI non certifica prove matematiche né esegue codice.

Il prompt metodologico corrente è **v2**. Le valutazioni v1 rimangono
leggibili nella cache per conservarne la storia, ma non producono esclusioni
o raccomandazioni nuove: sono da valutare fino al riesame del PDF. La versione
è verificata sia nella freschezza del record sia nel riuso dell'analisi.
Il confronto di taratura su sei PDF è documentato in
[docs/paper-screening-calibration.md](docs/paper-screening-calibration.md).

Le pubblicazioni riconosciute sono configurate in
`src/lib/paper-quality/metadata.ts`: il tipo Crossref da solo e la mera presenza
su OpenReview non bastano. OpenReview usa il `venueid` ufficiale di accettazione;
quando le decisioni pubbliche sono accessibili vengono controllate anche quelle.
Workshop e submission rifiutate non diventano accettazioni della main track.
Il matching usa un id arXiv esatto oppure titolo e autore esatti. Crossref segue
solo DOI espliciti e relazioni registrate verso la versione pubblicata.
La copertura è incompleta: nessun avviso trovato non garantisce l'integrità.

I primi risultati compaiono progressivamente, due PDF alla volta, alternando
HF e arXiv fin dal primo lotto quando entrambe le fonti hanno paper. La prima
visita può richiedere diversi minuti e consuma chiamate AI. Disattivare
l'interruttore interrompe i lotti successivi; le richieste già ricevute dal server
possono terminare. I metadati si ricontrollano dopo un giorno, con cache per
fonte di un'ora; gli errori hanno una scadenza più breve. L'analisi AI si riusa
fino a 30 giorni per la stessa revisione e le stesse recensioni. Nuove revisioni,
review o versioni del prompt invalidano il riuso al controllo successivo.

I risultati stanno in `paper-quality.jsonl` su Blob, condivisi tra utenti,
con scritture a lotti e rimozione dei record non ricontrollati da 30 giorni.
Si rivalutano i paper ancora nei feed: non è un archivio di monitoraggio dei
paper usciti dal feed. L'API accetta solo chiavi presenti nei feed del server,
richiede login e Blob e non usa titoli o PDF forniti dal client.
Senza login resta visibile il feed completo; senza configurazione AI la
valutazione metodologica resta non disponibile. Le chiavi OpenAlex e Semantic
Scholar sono opzionali ma consigliate per limitare i rate limit: vedi `.env.example`.

Le impostazioni passano da v1 a **v2** con migrazione esplicita che conserva
categorie, segnalibri e letti e attiva la scrematura. La disattivazione è
un'operazione indipendente, così non sovrascrive le modifiche di altre schede.

## Account e impostazioni

Senza accesso si vedono solo le liste di News e Papers. Con l'accesso Google,
se l'email è in `ALLOWED_EMAILS`, compaiono stelle, letti, riassunti e la
lettura diretta, e si generano i riassunti mancanti.

Categorie arXiv, segnalibri e articoli letti stanno in **un file JSON per
utente** su Blob:

```jsonc
{ "version": 2, "paperScreening": true, "arxivCategories": [...], "bookmarks": [...], "visited": [...] }
```

Le modifiche si vedono subito e si salvano a lotti qualche secondo dopo. Quello
che una versione precedente teneva nel `localStorage` si unisce all'account al
primo accesso da quel browser. Il backup è il file stesso, scaricabile dalla
dashboard Vercel.

Le categorie arXiv selezionabili sono le 50 di `cs`, `stat` ed `eess`, prese da
<https://arxiv.org/category_taxonomy>. Aggiungere math o physics significa
aggiungere righe a `ARXIV_CATEGORY_CATALOG` in `src/lib/config.ts`, niente
altro. La selezione si applica da sola, all'apertura e a ogni modifica.

## Struttura

```
src/lib/feed.ts             tipo FeedItem, dedup, ordinamento, filtri
src/lib/config.ts           catalogo categorie arXiv, tetti, user-agent
src/lib/settings*.ts        stato dell'utente: modello condiviso e copia nel client
src/lib/auth.ts             login Google con Better Auth, allowlist
src/lib/summaries/          riassunti: file su Blob e generazione con Haiku
src/lib/reader/             lettura diretta: estrattori, commenti, sanitizer
src/lib/sources/            un fetcher per fonte, tutti server-only
src/app/                    le tre pagine, le Server Action e le route API
```

Note di architettura e decisioni prese: `CLAUDE.md`.
