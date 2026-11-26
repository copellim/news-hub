# news-hub — CLAUDE.md

@AGENTS.md

Aggregator for personal use, deployed on Vercel (Hobby plan). Three pages:
**News** (Hacker News, Lobsters, r/programming), **Papers** (HF Daily Papers,
filtered arXiv, with a summary in Italian for each paper) and **Da leggere** (to
read, a queue of bookmarks). When signed in, articles and comments are read in a
card without leaving the portal. Google sign-in restricted to an email
allowlist; no database: pages are static with a cache per source, user state
and summaries live on Vercel Blob.

It must be kept simple: one or two people use it. A single storage service
(Blob), no architectures designed for traffic that does not exist.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4,
`fast-xml-parser` for the arXiv RSS, Better Auth (Google, stateless),
`@vercel/blob`, `@anthropic-ai/sdk` (Claude Haiku 5.5), `@mozilla/readability`
+ `linkedom` + `sanitize-html` for direct reading. Package manager: pnpm.
Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest, no network:
ordering and filters of `feed.ts`; arXiv and HF fetchers, pace of arXiv
requests and composition of the Papers lane; direct reading, with fixtures
trimmed from real responses; scientific screening (model, metadata, artifacts,
cache, `screenPapers`); personalization with Jev; the routes
`/api/papers/screen` and `/api/papers/interest`. External calls are mocked
with `vi.mock`).

## Caching — the load-bearing rule

`cacheComponents: true` in `next.config.ts`. Every fetcher is a function with
`"use cache"` + its own `cacheLife`, because the sources have different paces:

| Source     | `cacheLife` | Why |
|------------|-------------|-----|
| HN, Lobsters, Reddit | `minutes` | front page that turns over continuously |
| HF Daily   | `hours`     | human selection, once a day |
| arXiv      | `hours`     | the feed updates at midnight ET and skips the weekend; with `days` a feed downloaded shortly before the update would stay for a whole day |

There is no manual refresh, but there is a freshness check in the client.
All caches are stale-while-revalidate, the ISR page included: with one or two
people almost every visit is the first after a pause and receives the old copy
while the new one is being prepared (verified on Vercel: `x-vercel-cache:
STALE`, then `HIT` with `age: 3` four seconds later). For this reason every
fetcher also returns `fetchedAt`, the time it actually downloaded, and the lane
carries it in `Lane.fetchedAt`. The `FeedBoard`, on mount and on returning to
the tab, compares the age with `REFRESH_AFTER_MS` from `feed.ts`. If the data is
old it calls `loadLane` again and retries a couple of times a few seconds
apart, until the regenerated copy arrives. The age is measured with the server
time returned by `loadLane`, so a wrong phone clock does not make it request
the lane forever.

Do **not** use `export const revalidate` at route level: in Next 16 caching
goes through `use cache`, and `fetch` is no longer cached by default.

## Structure

```
src/lib/feed.ts             # client-safe: FeedItem type, dedup, ordering
src/lib/config.ts           # client-safe: hardcoded arXiv filter, user-agent
src/lib/sources/http.ts     # fetch with user-agent + timeout, SourceError
src/lib/sources/<source>.ts # one fetcher per source, `import "server-only"`
src/lib/sources/index.ts    # getLane, Promise.allSettled, getPaperTexts
src/lib/settings-model.ts   # client-safe: shape of the state, operations, validation
src/lib/settings.ts         # client: local copy of the state + batched saves
src/lib/user-settings.ts    # server: one JSON file per user on Blob
src/lib/blob-store.ts       # server: read and conditional write on Blob
src/lib/auth.ts             # server: Better Auth, allowlist, getSignedInEmail
src/lib/auth-client.ts      # client: Better Auth authClient
src/lib/summaries/          # server: JSONL of the summaries, whole-paper summaries, generation with Haiku
src/lib/paper-summaries.ts  # client: usePaperSummaries
src/lib/reader-model.ts     # client-safe: ReaderArticle, Discussion, Comment
src/lib/reader/             # server: extractors, comment adapters, sanitizer, whitelist
src/lib/reader-content.ts   # client: useReaderArticle, useReaderDiscussion
src/lib/paper-quality/      # mixed: paper screening (metadata, PDF assessment, artifacts, cache on Blob), useScreening
src/lib/paper-interest/     # mixed: affinity of papers with favourites via Jev, useInterest
src/app/actions.ts          # Server Action: loadLane, summaries
src/app/api/auth/[...all]/  # Better Auth route
src/app/api/settings/       # GET/POST of the signed-in user's state
src/app/api/reader/         # GET article and GET comments for the card
src/app/api/papers/screen/  # POST: screening of at most two papers present in the feed
src/app/api/papers/interest/ # POST: affinity scores of the candidates with the saved favourites
src/app/page.tsx            # News lane
src/app/papers/page.tsx     # Papers lane
src/app/da-leggere/page.tsx # reading queue
```

Server/client boundary: `sources/`, `summaries/`, `reader/`, `auth.ts`,
`blob-store.ts` and `user-settings.ts` are `server-only`. The types and
constants that the components also need live in `feed.ts`, `config.ts`,
`settings-model.ts` and `reader-model.ts`, which import nothing from `node:*`.

`paper-quality/` and `paper-interest/` are not `server-only` as a whole: they
are mixed folders. `assess.ts`, `artifacts.ts`, `metadata.ts`, `screen.ts`,
`store.ts` and `jev.ts` have `import "server-only"`; outside the two folders
only the routes `api/papers/screen` and `api/papers/interest` import them. The
two `model.ts` files are client-safe (no directive, they import only `feed.ts`
and `config.ts`) and are used both by the routes and by `FeedBoard`, `FeedList`
and `PaperQualityDetails`. `use-screening.ts` and `use-interest.ts` are
`"use client"`, `FeedBoard` imports them, and they talk to the server only via
`fetch` to the two routes.

## Environment variables

They live in the Vercel project `news-hub`, not by hand in `.env.local`: locally
they are downloaded with `vercel env pull .env.local --environment
development`, which rewrites the whole file. The pull must be redone when
`VERCEL_OIDC_TOKEN` expires (a few hours): without it, Blob answers 403. List
and meaning in `.env.example`.

## Decisions not to overturn without a reason

- **Papers has only two views: Valutazione scientifica (scientific assessment)
  and Più recenti (most recent).** The first groups the verdicts, the second
  orders globally by date. Votes are reserved for News and must not give HF
  precedence among papers.
- **Papers analyses a fixed pool larger than the page.** The page shows 10
  papers per source by default; `useScreening` receives, after the date and read
  filters, up to `candidateLimit(limit)` = `min(50, max(30, 3 × limit))`
  candidates per source (`src/lib/paper-interest/model.ts`). Excluded papers
  free up places among the candidates already in the pool, but verdicts must
  not change the pool or start replacement analyses beyond it. Raising the
  limit only adds keys not yet received for the same feed/categories.
- **At least 20 candidates per channel in the metadata pool, separate from the
  analysis.** Each source is retrieved independently. The arXiv pool has a
  margin of 100 before deduplication with HF, then each source is limited to
  50. Duplicates must not empty arXiv. Insufficient quantities and partial
  retrievals are reported.
- **Ranking by position within its own source (Più votati/Più discussi, most
  voted/most discussed).** 1551 HN points and 163 Lobsters points are not the
  same unit, but "third out of 50 on HN" and "second out of 25 on Lobsters" are:
  items are ordered by the share of the source that sits below them
  (`rankWithinSource` and `topShareOf` in `src/lib/feed.ts`), and on a tie the
  most recent wins. The same applies to "Più discussi" on comments. Previously
  the ratio to the source's maximum was used, but a single viral post crushed
  all the others from its source. The ratio to the total is instead discarded,
  because it would reward the sources that return fewer items. Sources without
  a score (arXiv) stay out of the ranking and end up at the bottom, in a group
  with its own title. Among them the date orders nothing: arXiv dates the
  announcement, not the paper (in the cs.AI feed all 370 items of one day have
  the same `pubDate`), so the feed order remains. The row shows the bar and
  "top N%", that is the number the list is ordered on: raw points jump from one
  source to another, and without that number the order looks random.
  Do **not** use the source's native position as a ranking: the order of HF's
  `daily_papers` is not by upvotes (verified), it would give a fake ranking.
- **Missing scores are `null`, never `undefined`.** Algolia omits `points` on
  some hits: with `undefined` the source's maximum becomes `NaN` and the whole
  source slides to the bottom. Normalise with `?? null` in each fetcher's
  `toFeedItem` and check with `typeof score !== "number"`.
- For the same reason as the ranking, the two lanes stay separate pages.
- **Ordering and number per source are client state**, not network parameters:
  the fetchers always download `SOURCE_FETCH_LIMIT` (50) and the page cuts.
  This way the controls are instant and the routes stay statically
  prerendered.
- **First order, then cut per source** (`sortItems` → `takePerSource`): this way
  each source contributes its best N by the chosen criterion and not the first
  N it returned.
- **The "Ultime 24 ore" (last 24 hours) / "Prima" (earlier) tiers only with
  "Più recenti".** On a ranking they would break it: "Prima" would restart from
  the top after the first tier had gone down. The bar always measures the
  criterion of the chosen ordering, points or comments.
- **The period filters before ranking.** On News "Ultime 24 ore" removes the
  older items before `rankWithinSource`, so "today's most voted" are compared
  with each other. Week and month do not exist because the sources give only
  the current front page: new fetchers would be needed.
- **After a client load that result rules, not the prop.** The Server Action
  restarts the RSC render, and that render does not know the categories chosen
  on the page: binding to the `lane` prop would put the defaults back right
  after changing them. See `activeLane` in `FeedBoard.tsx`.
- **No manual refresh.** There is no "Aggiorna" (refresh) button and there are
  no `cacheTag`/`updateTag`: freshness comes only from each fetcher's
  `cacheLife`. Bringing one back means bringing the tags back too.
- **Dedup with the key `arxiv:<id>`.** HF's `paper.id` *is* the arXiv id, so the
  key matches exactly. On the news side the key is `<source>:<native id>`.
- **HN via Algolia, not Firebase.** `?tags=front_page` returns items already
  hydrated in one call; `topstories.json` gives only ids and forces an N+1.
- **arXiv: RSS plus the official recent lists.** If the announcements are
  insufficient, it uses `recent` and up to three previous months; requests
  serialised at 3 s per worker and an hourly cache. The daily RSS alone can be
  empty even when hundreds of recent papers exist. Missing abstracts are read
  from `abs` on demand for papers already in the pool. Do not use the export
  API as the only retrieval: in real tests it answered with timeouts.
- **One source down does not take down the lane**: `Promise.allSettled`, and the
  error appears on the page with the source's name.

## Reddit

The only source that requires credentials. Anonymous access is not usable from
a server: `www.reddit.com/r/programming.json` answers **403** even with a
custom user-agent, and the RSS feed switches to **429** already on the second
request. An app registered at <https://www.reddit.com/prefs/apps> (type
*script*) and OAuth `client_credentials` towards `oauth.reddit.com` are needed.
Variables in the Vercel project, see `.env.example`. Without credentials the
lane stays empty and the page says so.

## Not done yet (decided, postponed)

- **Journals** (JMLR, Nature Machine Intelligence) in a third, low-speed lane:
  ~1-2 items a week, they would drown if mixed with arXiv.
  Note: the Nature feed is RSS 1.0/RDF, not RSS 2.0.

## Sign-in

Better Auth with only the Google provider and **no database**: without
`database` it switches by itself to stateless mode, with the session in an
encrypted 7-day cookie. A single session cannot be revoked; changing
`BETTER_AUTH_SECRET` closes them all.

- **Allowlist in `ALLOWED_EMAILS`**, checked twice: in the
  `databaseHooks.user.create.before` hook (the in-memory adapter recreates the
  user at every sign-in, so the hook sees the sign-ins) and in
  `getSignedInEmail`, which is the only gate for Server Actions and routes. The
  user always comes from the session, never from the request body.
- **Pages stay static**: the session is read only in the client
  (`authClient.useSession`) and in routes/Server Actions, never in the render.
- Those who have not signed in see only the News and Papers lists: no
  summaries (neither read nor generated), stars or read state. The app is
  personal and every feature beyond the list stays behind sign-in, even when it
  costs nothing.

## User state: one file per user on Blob

`users/<sha256 of the email>/settings.json` on the private store
`news-hub-blob`, with the shape:

```jsonc
{ "version": 2, "paperScreening": true, "paperPersonalization": true, "arxivCategories": [...], "bookmarks": [...], "visited": [...] }
```

`src/lib/settings.ts` is the only place that talks to `/api/settings`. It
exposes five domain views (`useBookmarks`, `useVisitedItems`,
`useArxivCategories`, `usePaperScreening`, `usePaperPersonalization`) plus
`useSettingsStatus` (`loading` / `signedOut` / `ready` / `error`). The current
version is 2: `normalizeSettings` explicitly migrates v1, keeping the data and
turning on `paperScreening`. Future changes require a new version and an
explicit migration.

- **The client sends operations, not the object** (`SettingsOperation` in
  `settings-model.ts`): the server applies them to the latest version of the
  file. With the whole object, a tab with an old copy would delete what another
  one has just saved. Client and server use the same `applyOperations`.
- **Batched saves**: the page updates immediately, the operations leave 3 s
  after the last one and when the tab is hidden (`fetch` with `keepalive`,
  which is why it is a route and not a Server Action). Every save is a `put`,
  and Blob's Hobby plan allows 2,000 a month: beyond that, the store stays
  blocked for 30 days.
- **Conditional write**: `updateBlobText` rereads from the origin
  (`useCache: false`) and writes with `ifMatch` on the ETag; on
  `BlobPreconditionFailedError` it starts again. The CDN can serve the old
  version for about a minute after an overwrite, so whoever rewrites never
  reads from the cache. That read asks for `accept-encoding: identity`: if the
  CDN compresses the response (brotli, already with a 3 KB JSONL) the ETag
  becomes weak, `W/"…"`, and `put` always rejects it with "ETag mismatch".
  `head()` and `list()` give the strong ETag, a compressed `get()` does not
  (verified).
- **Snapshot stable by identity.** `useSyncExternalStore` compares snapshots
  with `===`: the object is replaced only when something changes.
- **Bookmarks save the whole item**, not just the id: an article stays readable
  even when it has dropped off the front page.
- **Read items have a cap** (`MAX_VISITED`, 2000): the file is rewritten whole
  on every save.
- **`normalizeSettings` discards invalid entries, not the whole file**. A
  completely unreadable file, on the other hand, is an error and is not treated
  as empty, otherwise the next save would wipe it.
- **Recovery from localStorage**: on the first load with sign-in, what the
  previous version kept in `news-hub:settings:v1` is merged into the account
  (`mergeLocal`: union of bookmarks and read items) and the key is deleted. It
  can be removed when no longer needed. There is no export/import any more: the
  backup is the file on Blob, downloadable from the Vercel dashboard.

## Paper summaries

A summary in Italian under every **visible** paper of the Papers lane. All
users share the same file: `summaries.jsonl` on Blob, one line per paper
(`key`, `text`, `origin`, `model`, `promptVersion`, `createdAt`).

- **Source of the text**: for HF the `ai_summary` that the HF API already
  provides is translated; for arXiv, or if HF does not have one, the abstract
  (the RSS `description` field) is summarised. Abstract and `ai_summary` stay on
  the server: the fetchers keep them in the same cache entry as the item, but
  only the item reaches the page.
- **Whitelist**: the Server Actions receive only keys, and `getPaperTexts` looks
  up the texts in the cached feeds. A key that does not appear in the feeds
  produces nothing, so nobody can have an arbitrary text summarised.
- **Only when signed in**, both `readPaperSummaries` and
  `generatePaperSummaries`: every summary is a paid call (Haiku 5.5, extended
  thinking off, ~$0.0001 per paper), and even reading the ready ones remains a
  feature for account holders.
- **In batches of 8, one after the other** (`usePaperSummaries`): the first ones
  appear within a few seconds and only one batch at a time rewrites the file.
  Before generating, the file is reread from the origin, so a summary just
  saved by another tab is not paid for twice.
- **Pruning at 30 days**: an older paper does not come back into the feeds. The
  file stays around 2 MB and is downloaded whole on every read.
- **`SUMMARY_PROMPT_VERSION`**: raising it regenerates everything on the next
  load. A refusal or a truncated text is not saved.

### Whole-paper summary

In a paper's card there is "Riassumi il paper con l'AI" (summarise the paper
with AI): a summary in five paragraphs (Problema, Idea, Metodo, Risultati,
Limiti: problem, idea, method, results, limitations), **only on request**,
because it costs money.

- **Source**: the arXiv PDF. The server downloads it and passes it in base64,
  with a cap of 20 MB to stay under the 32 MB request limit. Giving the URL to
  the model would hide an arXiv error. The PDF also has figures and tables, and
  it exists for every paper, while the HTML does not.
- **Model**: Haiku 5.5 with adaptive thinking at `medium` effort. On a 30-page
  paper: ~10 s and less than a cent.
- **One file per paper**, `paper-digests/<id>.json` on Blob, shared by all. It
  is not in `summaries.jsonl`, which is downloaded whole every time Papers is
  opened: a few hundred words per paper would bloat it with texts read only by
  opening the card. It is read from the origin, so a summary just written
  appears at the next opening.
- **Route `/api/reader/digest`**: GET reads, POST generates. POST rereads
  before generating, so a double click does not pay twice. It accepts only new
  arXiv ids, because the id becomes the file name.
- **`DIGEST_PROMPT_VERSION`**: raising it makes the button reappear; an old
  summary is not regenerated by itself.

## Direct reading

When signed in, a click on the title or on the comments opens a card
(`ReaderSheet`): a modal bottom sheet on mobile, a modal side sheet from `sm`,
a `<dialog>` with `showModal()`. It has the tabs "Articolo" (article) and
"Commenti" (comments). Ctrl/Cmd, Shift, Alt and the middle button still open
the site in a new tab. Without sign-in the title stays a link: the routes also
answer 401.

- **Two registries, one model.** Articles go through an ordered list of
  extractors (`reader/extractors/`), where the first one that recognises the
  URL wins: `arxiv`, then `generic`. Comments have one adapter per source
  (`reader/discussions/`). All of them produce `ReaderArticle` or `Discussion`
  from `reader-model.ts`. A new site is one file and one line in the list,
  before the generic one.
- **No per-site parser for articles.** HN and Lobsters links lead to dozens of
  different domains (45 out of 49 in the verified sample). The generic one is
  Readability on linkedom: on the sample it read 44 articles out of 49, GitHub
  included. The others were apps or SPAs (LessWrong), and under 500 characters
  the result becomes `unavailable` with the `og:description`. No iframes: 20
  sites out of 49 block them with `X-Frame-Options` or `frame-ancestors`.
- **Only the abstract of a paper**, from the `abs` page. The card has two
  buttons: "Leggi il paper completo" (read the full paper), which points to the
  arXiv HTML when there is one (`a#latexml-download-link`; 17 papers out of 20
  in a cs.LG sample) and otherwise to the PDF, and the whole-paper summary (see
  above). The full text in a card is not quick reading.
- **Comments**:
  - HN: the tree from Algolia `items/<id>`, but its children are in id order.
    The order of the first level comes from Firebase's `kids`; the levels below
    stay chronological, because ordering them would cost one call per comment.
  - Lobsters: `s/<id>.json`, a flat list already in the site's order.
  - HF: `api/papers/<id>?field=comments` (documented in HF's OpenAPI spec).
  - Reddit and arXiv have no adapter.
- **A single sanitizer** (`reader/sanitize.ts`) for all external HTML. It makes
  `href` and `src` absolute against the final URL, because linkedom does not,
  and opens links outside the card. It removes `srcset`, styles and scripts,
  and keeps MathML.
- **Whitelist.** The client sends only the key.
  - Discussions: the id goes to a fixed host and validating its shape is
    enough.
  - Articles: the URL is derived from the id for papers. For news it is looked
    up in the cached snapshot of the key's source only, then in the user's
    bookmarks (a saved article may have dropped off the front page).
  - No URL comes from the client.
- **GET routes, not Server Actions.** A page's Server Actions run one at a time,
  and on the Papers lane the card would wait for the summary batches.
- **Cache**: `"use cache"` per URL with `cacheLife("days")` for articles,
  `"minutes"` for discussions. Network errors do not enter the cache: a site
  that is down becomes an `unavailable` outside the cache. At runtime on Vercel
  the cache is in memory per instance: after a cold start it is downloaded
  again. In the client `reader-content.ts` keeps the responses for the duration
  of the visit.
- **The back button closes the card.** On opening, an entry is added with
  `history.pushState` (Next 16 supports it and puts its own state beside it),
  and closing with Esc or with the X removes it. In `StrictMode` the effect does
  not add the entry twice.

## Category filter of the Papers lane

`ARXIV_CATEGORY_CATALOG` contains the arXiv taxonomy for the archives the app
is interested in — Computer Science, Statistics, EESS: 50 categories taken from
<https://arxiv.org/category_taxonomy>. It is also the **whitelist**: the id
comes from the client and ends up in a URL, so it is validated both in the
Server Action and in `getCategoryFeeds`. Adding math/physics = adding rows to
the catalog.

`getCategoryFeed` caches **one entry per category**: changing the selection
reuses the feeds already downloaded instead of repeating the requests.

The categories **alternate**, one paper at a time from each, before the cut to
`SOURCE_FETCH_LIMIT`. Concatenated, the cut kept only the first: cs.AI alone
announces hundreds of papers a day, and cs.LG and cs.CL did not appear.

**There is no refresh button: every change applies by itself.** The server
render does not know who the user is and always uses the defaults, so the
`FeedBoard` compares the persisted selection with the one the displayed data
was built with (`loadedSelection`) and, if they differ, calls `loadLane` — on
opening and at every chip clicked.

`loadLane` **does not invalidate the cache**: the feeds already have a
`cacheLife` per source and changing category is not a reason to download them
again. As a consequence `cacheTag`/`updateTag` no longer exist: freshness
depends only on `cacheLife`.

Out-of-order responses are discarded with a request counter
(`latestRequest`): clicking several chips in a row, the first response can
come back after the last one and put old data back.

## Read / unread

A click on the title **or on the comments link** marks the article as visited —
both mean "I opened it", whether the card or the site opens. The title turns
grey, "letto" (read) appears in the row, and the "Solo non letti" (unread only)
switch works on this.

In the `FeedBoard` the order is **period → sort → filter by read → cut per
source**: if it cut first, each source would waste its N positions on articles
that the filter is about to hide.

## Relative ages

"16 ore fa" (16 hours ago), the "Ultime 24 ore" tier and the "Nuovo" (new)
label depend on the current time, so they exist only after mount (`useNow` in
`src/lib/now.ts`, `null` on the server). The page is prerendered and served
from the cache: an age computed in the render would be frozen and would give a
hydration mismatch. Before mount the row shows the absolute date.

## Style: Material 3, one palette per section

The interface follows Material 3: colour roles, small top app bar (`AppBar`),
navigation bar on mobile and navigation rail from `sm` (the same `LaneTabs`),
tabs, segmented button, switch, filter chips, state layers and ripple on
press. The fonts stay those chosen for reading, Instrument Sans and
Newsreader.

- **No big title.** The navigation already says which section it is: at the
  top there is a one-line bar with the name at 22 px, which switches to the
  container tone when the page scrolls.
- **Palette per section.** News, Papers and Da leggere each have their own M3
  roles, generated with `@material/material-color-utilities` from a source
  colour. In light mode backgrounds and neutrals come from the tonal spot
  variant and the accents from fidelity. In dark mode the tonal spot neutrals
  (chroma 6) made the three sections look the same, so they come from tonal
  palettes with chroma 16, 22 and 32 at the M3 tones of the dark theme. The
  values are in `globals.css` under `[data-section]`. Regenerating them means
  redoing the computation and rechecking the contrasts, not touching up a hex
  value by hand.
- **`data-section` lives only in `SectionFrame`**, in the layout, and not in the
  pages: because of `<Activity>` (below) the previous page stays in the DOM,
  and two live sections together would fight over the colours. The `surface`
  of each section is repeated in `src/lib/sections.ts`, because
  `viewport.themeColor` wants literal values.
- **Global rules live in Tailwind's layers** (`base`, `components`): outside
  the layers they would win over the utility classes.
- **Press ripple**: `spawnRipple` in `src/components/ripple.ts` adds the circle
  inside a `data-ripple-host` container that React renders empty, so
  reconciliation does not touch it. With reduced motion it does not start.

## Note on Next 16: `<Activity>`

After a client navigation the previous route **stays in the DOM** with
`display: none` (React `<Activity>`, it serves the instant "back"). It is not a
bug and it is not orphaned DOM: end-to-end tests must scope selectors to the
visible page, otherwise they pick up hidden elements and clicks fail because
of ambiguity.

## Scientific screening

`src/lib/paper-quality/` separates metadata, AI analysis of the PDF, selection
rules and JSONL persistence on Blob. The route `/api/papers/screen` works on
two papers at a time, authenticated and present in the server's feeds.
`useScreening` progressively feeds the Papers page: filter on by default,
switch saved in the account; Consigliati (recommended) and Da valutare (to
review) stay visible, only the Esclusi (excluded) are in the expandable
section. The batches alternate HF and arXiv. The v2 methodological prompt
distinguishes limitations, missing information and substantive flaws (the
latter require a reference and the impact on the conclusion). v1 assessments
stay to review until re-examined, without reusing them as v2.
Details of the rules, thresholds, pools, caches and sources in
`docs/screening-and-thresholds.md`.
OpenReview reviews may require an interactive challenge (403): the official
venueid is kept when available, reporting that the reviews were not read. Do
not bypass the challenge and do not infer rejections from errors.
