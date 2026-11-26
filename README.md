# news-hub

A personal reader for tech news and machine-learning papers, built with
Next.js and deployed on Vercel. It pulls five sources into two lanes, writes
short LLM summaries of papers, screens papers for methodological quality, and
keeps a reading queue of bookmarks. There is no database: pages are static with
a cache per source, and user state lives in Vercel Blob.

This is a personal tool designed for one or two users. Sign-in is restricted to
an allowlist of email addresses, and the architecture deliberately avoids
anything meant for traffic it will never see. The interface and the generated
summaries are in Italian.

## Features

- **News lane**: Hacker News (front page through the Algolia API), Lobsters and
  r/programming (Reddit OAuth, optional).
- **Papers lane**: Hugging Face Daily Papers and arXiv, filtered by a
  selectable set of arXiv categories from `cs`, `stat` and `eess`.
- **Ranking by position within each source**, so a story's standing on Lobsters
  and on HN can be compared even though their raw scores cannot.
- **Deduplication by arXiv id**: a paper that appears on both Hugging Face and
  arXiv collapses into a single row.
- **Paper summaries** generated with Claude Haiku: a translation of the
  one-line summary Hugging Face already provides, or a summary of the arXiv
  abstract. On request, a longer digest of the whole paper is written from the
  PDF.
- **In-app reader**: articles are extracted with Mozilla Readability and shown
  in a sheet inside the app, with Hacker News, Lobsters and Hugging Face
  comments in a second tab.
- **Paper screening**: each paper is checked against bibliographic sources and
  its full PDF is assessed by the model, then sorted into recommended, to
  review, and excluded.
- **Personalized ranking (optional)**: candidate papers are compared with the
  user's most recent saved papers through an external affinity API.
- **Bookmarks and read state**, saved per account.
- **Google sign-in** with an email allowlist; everything beyond the plain lists
  is available only to signed-in, allowed users.

## Stack

- Next.js 16 (App Router, `cacheComponents` with `"use cache"` and
  `cacheLife`), React 19, TypeScript
- Tailwind CSS 4
- Better Auth with the Google provider, stateless (no database)
- Vercel Blob for user settings, summaries and screening results
- Anthropic SDK (`claude-haiku-5-5`) for summaries, digests and PDF assessment
- `@mozilla/readability`, `linkedom` and `sanitize-html` for the reader
- `fast-xml-parser` for the arXiv RSS feeds
- Vitest for tests, ESLint, pnpm

## Architecture

**Static pages, a cache per source.** Every source fetcher is a `"use cache"`
function with its own `cacheLife`: `minutes` for Hacker News, Lobsters and
Reddit, `hours` for Hugging Face and arXiv (`src/lib/sources/`). There is no
manual refresh button; the client compares the age of the data with the
server's clock and reloads the lane when it is stale.

**One failing source does not take down a lane.** Sources are fetched with
`Promise.allSettled`, and a failure is shown on the page with the source's
name (`src/lib/sources/index.ts`).

**The client sends keys, never URLs or text.** Summaries, the reader and the
screening API accept only item keys, and the server looks up the text or the
URL in its own cached feeds (or in the user's bookmarks for saved articles).
A key that is not in a feed produces nothing, so nobody can make the app fetch
or summarize arbitrary content at the owner's expense.

**Authentication.** Better Auth runs without a database, so the session is an
encrypted cookie. The allowlist from `ALLOWED_EMAILS` is checked twice: when the
user is created at sign-in and again in `getSignedInEmail`, the single entry
point used by every Server Action and API route (`src/lib/auth.ts`).

**User state in one JSON file per user** on Blob, at
`users/<sha256 of the email>/settings.json`, holding the arXiv categories,
bookmarks, read items and the screening and personalization switches
(`src/lib/settings-model.ts`, `src/lib/user-settings.ts`). The client sends
operations rather than the whole object, saves them in batches, and the server
applies them to the latest version with a conditional write on the blob's ETag
(`src/lib/blob-store.ts`).

**Shared caches on Blob.** Paper summaries live in a single `summaries.jsonl`,
whole-paper digests in `paper-digests/<id>.json`, and screening results in
`paper-quality.jsonl`, all shared between users so that nothing paid for is
generated twice.

**Paper screening** (`src/lib/paper-quality/`) combines metadata from arXiv,
Semantic Scholar, Crossref, OpenReview and OpenAlex with a model assessment of
the full PDF covering claims, validation, reproducibility and limitations.
Links to code, models and datasets found in the PDF are checked through the
public GitHub, Hugging Face and Zenodo APIs. A retraction or a substantive flaw
tied to a reference in the PDF excludes a paper; missing information or
documented limitations leave it to review. The client screens two papers per
request, and an assessment is reused for up to 30 days. A calibration run of
the current prompt is documented, in Italian, in
[docs/paper-screening-calibration.md](docs/paper-screening-calibration.md).

### Layout

```
src/app/                    pages (News, Papers, reading queue), Server Actions, API routes
src/lib/sources/            one server-only fetcher per source
src/lib/feed.ts             FeedItem type, deduplication, ranking, filters
src/lib/config.ts           arXiv category catalog, limits, user agent
src/lib/auth.ts             Better Auth setup and allowlist
src/lib/settings*.ts        user state: shared model and client copy
src/lib/summaries/          summaries and digests: Blob storage and generation
src/lib/reader/             article extractors, comment adapters, sanitizer
src/lib/paper-quality/      paper screening: metadata, assessment, rules, storage
src/lib/paper-interest/     optional affinity ranking against saved papers
```

`CLAUDE.md` holds the detailed design notes and the decisions behind them (in
Italian).

## Running locally

Requirements: Node.js 20.9 or later (required by Next.js 16) and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev
```

The app runs at <http://localhost:3000>. `.env.example` lists every variable
with a comment:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: a Google OAuth client of type
  "Web application" with the redirect URI
  `http://localhost:3000/api/auth/callback/google`.
- `BETTER_AUTH_SECRET` (at least 32 characters, for example from
  `openssl rand -base64 32`), `BETTER_AUTH_URL`, and `ALLOWED_EMAILS`, a
  comma-separated list of the addresses allowed to sign in.
- `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN`: a Vercel Blob store. On a linked Vercel
  project, `vercel env pull .env.local --environment development` writes these
  and the other variables; the OIDC token expires after a few hours and Blob
  then answers 403 until the file is pulled again.
- `ANTHROPIC_API_KEY`: without it, saved summaries are still shown but no new
  ones are generated, and the PDF assessment is unavailable.
- Optional: `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` for an app of type
  "script" registered at <https://www.reddit.com/prefs/apps> (without them the
  r/programming lane stays empty, because Reddit refuses anonymous requests
  from servers); `OPENALEX_API_KEY` and `SEMANTIC_SCHOLAR_API_KEY` for higher
  rate limits during screening; `TYPESAFE_API_KEY` for the personalized ranking.

The other scripts are `pnpm build`, `pnpm start`, `pnpm lint` and
`pnpm typecheck`.

## Tests

```bash
pnpm test
```

Vitest runs every `src/**/*.test.ts` file in a Node environment
(`vitest.config.mts`). The `server-only` import is aliased to a stub so that
server modules can be tested from Node. The suites cover feed ranking and
deduplication, the source parsers, the reader and comment adapters (with
fixtures trimmed from real responses), the screening and interest models,
bibliographic metadata and artifact checks, the Blob store for screening
results, and the screening and interest API routes.

## License

[MIT](LICENSE)
