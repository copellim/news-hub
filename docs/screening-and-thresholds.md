# Scientific screening: rules, thresholds and pools

This note collects how the screening of the Papers page works and the numbers
that govern it. The values are those in the code at the time of writing: each
one names the file it comes from, which remains the authoritative source.
The calibration comparison of the prompt is in
[paper-screening-calibration.md](paper-screening-calibration.md).

## Switch and visibility

The **Scrematura scientifica** (scientific screening) switch is on by default
and the preference is saved in the account (`paperScreening` in
`src/lib/settings-model.ts`). Turning it off brings back the full list at once,
with the same category and read filters, and the following batches do not
start; requests already received by the server may still complete.

The list shows **Consigliati** (recommended) at the top and **Da valutare** (to
review) below. Only the **Esclusi** (excluded) sit in the expandable section,
with reasons and sources. Papers waiting for analysis, or whose download or
services are unavailable, stay visible among those to review: an error never
produces a negative verdict (`verdictOf` in `src/lib/paper-quality/model.ts`).

With the **Valutazione scientifica** (scientific assessment) ordering the
candidates are grouped into recommended and to review, alternating HF and arXiv
within each group; with **Più recenti** (most recent) they stay in
chronological order.

## How many papers: page, analysis pool, retrieval

There are three numbers and they must not be confused.

1. **On the page**: 10 papers per source by default (`DEFAULT_PAPERS_PER_SOURCE`
   in `src/lib/config.ts`), selectable among 10, 20, 30 and 50
   (`ITEMS_PER_SOURCE_OPTIONS`).
2. **Analysis pool**: for each source, after the period filter and the read
   filter, up to `min(50, max(30, 3 × page limit))` candidates are analysed
   (`candidateLimit` in `src/lib/paper-interest/model.ts`, used in
   `src/components/FeedBoard.tsx`). With 10 on the page that is 30 per source,
   with 20 or more it reaches 50. The pool applies even with personalization
   off. Excluded papers free up places among the other candidates in the pool,
   but no replacement analyses start beyond the pool. The table on the page
   shows the analysed pool and the number pending.
3. **Metadata retrieval**: the minimum target is 20 distinct candidates per
   source (`MIN_PAPERS_PER_SOURCE`), up to 50 per source (`SOURCE_FETCH_LIMIT`).
   If a source does not reach 20 the page says so, without filling in with
   papers from the other one (`src/lib/sources/index.ts`). The quantity checks
   come before the read filter and screening: they do not guarantee 20
   recommended nor 20 unread.

Raising the page limit requests only the additional keys: results already
received during the visit are reused even after lowering the limit, changing
the ordering, or turning screening off and on again. Changing categories or
refreshing the feed rechecks only the current batch, with the server cache.

## Retrieval per source

Each source is retrieved independently.

- **Hugging Face** supplements the day's selection with the previous seven
  days, one at a time, until it has 20 papers
  (`src/lib/sources/huggingface.ts`).
- **arXiv** reads the RSS feeds of the chosen categories and, if there are
  fewer than 100 announcements per category (`ARXIV_CANDIDATE_LIMIT`, twice
  `SOURCE_FETCH_LIMIT`), supplements from the official `recent` list and then
  from the monthly lists, up to three months back (`src/lib/sources/arxiv.ts`).
  The margin of 100 is cut to 50 only after deduplication with HF, so even 50
  overlaps do not empty the channel. With no arXiv categories selected, arXiv
  retrieval stays off.
- Requests to arXiv are serialised and spaced at least 3 seconds apart per
  worker (`src/lib/sources/arxiv-request.ts`), with an hourly cache.
- Missing abstracts of entries taken from the HTML lists are downloaded from
  the `abs` pages only for keys that were requested and are already in the
  pool, with an hourly cache (`getArxivTexts` and `getAbstract`). The lists show
  the announcement date, not the download date.

## The two checks

When signed in, every paper in the pool goes through two checks
(`src/lib/paper-quality/`).

**Bibliographic sources** (`metadata.ts`): arXiv and Semantic Scholar for
identity and DOI; Crossref for publication and editorial notices (`update-to`:
retraction, withdrawal, removal, expression of concern); OpenReview for
acceptances and public reviews; OpenAlex for retractions (`is_retracted`) and
citation data, which does not enter the selection.

- The recognised venues are listed in `TRUSTED_VENUE` and
  `TRUSTED_OPENREVIEW`: the Crossref type alone and mere presence on
  OpenReview are not enough. OpenReview uses the official acceptance
  `venueid` and, when they are accessible, also checks the public decisions.
  Workshops and rejected submissions do not become main-track acceptances.
- Matching uses the exact arXiv id or the exact title and author. Crossref
  follows only explicit DOIs and the registered relations towards the
  published version.
- OpenReview reviews may require an interactive challenge (403): the `venueid`
  is kept when available and the page reports that the reviews were not read.
  The challenge is not bypassed and no rejection is inferred from an error.
- Coverage is incomplete: finding no notice does not guarantee integrity.

**Full PDF** (`assess.ts`): Haiku 5.5 assesses claims, validation,
reproducibility and limitations, distinguishing empirical, theoretical and
survey works. Every substantive judgement must point to a section, page or
table. Public reviews, when retrievable, are included as context. Links to
artifacts extracted from the PDF are checked with the public APIs of GitHub,
Hugging Face and Zenodo (`artifacts.ts`); other services remain unverified
claims. Availability, empty content and executed code are kept distinct: the
code is not executed and a public repository does not certify the results.

## Verdict rules

The rules are in `verdictOf` (`src/lib/paper-quality/model.ts`), in this
order.

1. Retraction reported by a bibliographic source: **excluded**.
2. No PDF analysis available, or an analysis from a prompt version other than
   the current one: **to review**.
3. A **substantive flaw** (outcome `fatal`), with a reference to the PDF and an
   explanation of how it undermines a central conclusion: **excluded**.
4. Editorial expression of concern: **to review**.
5. An uncertain or weak aspect: **to review**.
6. **Recommended** when claims and validation are supported, the work is not of
   type `other`, and reproducibility is supported or not applicable; a verified
   publication is enough to make up for limited reproducibility.
7. Everything else: **to review**.

The AI distinguishes four situations: adequate evidence, documented limitation,
missing information and substantive flaw; only the last one excludes. Absence
of code, proprietary models, a narrow domain and few seeds are not automatic
substantive flaws. A verified publication adds confidence to limited
reproducibility but does not redeem insufficient validation or a substantive
flaw. No selection uses relevance, upvotes, stars or citation thresholds, and
the assessment does not certify mathematical proofs.

The current methodological prompt is **v2** (`METHOD_VERSION`). v1 assessments
remain readable in the cache to keep their history, but they produce neither
exclusions nor recommendations: they are to review until the PDF is examined
again. The version is checked both in the record's freshness and in the reuse
of the analysis.

## Pace, cache and persistence

- The client sends **two papers per request** to `/api/papers/screen`, which
  rejects larger batches, alternating HF and arXiv from the first batch when
  both sources have papers (`screeningOrder` and `use-screening.ts`). The first
  visit can take several minutes and consumes AI calls.
- **Metadata** is cached per paper (`getPaperMetadata`: revalidation after an
  hour, expiry after a day). A record on Blob is fresh for a day, or for 15
  minutes if it contains error notices (`isFresh` in `store.ts`).
- The **PDF analysis** is reused for up to 30 days for the same arXiv revision,
  the same reviews, the same title and the same prompt version (`screen.ts`). A
  new revision, new reviews or a new prompt invalidate the reuse at the next
  check.
- Results are kept in `paper-quality.jsonl` on Blob, shared between users,
  with batched writes; records not rechecked for 30 days are removed on every
  write. Only papers still in the feeds are reassessed: it is not an archive of
  papers that have dropped out.
- The API accepts only keys present in the server's feeds, requires sign-in
  and Blob, and does not use titles or PDFs supplied by the client. Without
  sign-in the full feed stays visible; without AI configuration the
  methodological assessment stays unavailable. The OpenAlex and Semantic
  Scholar keys are optional but recommended to limit rate limiting (see
  `.env.example`).

## Settings

Settings move from v1 to v2 with an explicit migration that keeps categories,
bookmarks and read items and turns screening on (`normalizeSettings`).
Turning screening off is a separate operation, so it does not overwrite the
changes made in other tabs.

## Papers similar to favourites

`TYPESAFE_API_KEY` enables the comparison with Jev (TypeSafe API,
`src/lib/paper-interest/`). In the Valutazione scientifica view the
**Personalizza dai preferiti** (personalise from favourites) switch controls a
preference saved per account (`paperPersonalization`, on by default).

- The title and abstract of the pool's candidates are compared with the last 12
  papers saved among the bookmarks; no email goes to the model. Without an
  abstract only the title remains.
- Scores are cached with revalidation after an hour and expiry after a day,
  with a key that depends on the candidates and the favourites
  (`rankInterests` in `jev.ts`); the abstracts used for the comparison have
  their own cache, revalidated after a day.
- Requests to `/api/papers/interest` are authenticated, accept only papers in
  the server's feeds and at most 16 keys per batch.
- Within each tier, for every group of five papers from a source, two
  positions are first reserved for the top candidates of the normal ordering
  and then three are assigned by affinity, with a threshold of 0.65
  (`personalizePapers` in `model.ts`). In incomplete groups affinity takes at
  most 60% rounded down, so at least 40% is left to discovery. It is space
  independent of the profile, not a guarantee that the topics are different.
- If no candidate from a source reaches the threshold, that source stays in the
  normal ordering; the same happens without favourites, without a key or with a
  service error. The chronological ordering is not personalised, and affinity
  and scientific quality stay separate.
