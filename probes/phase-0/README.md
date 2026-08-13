# Phase 0 probes — de-risk measurements

Three measurements, no application code. Each gates a later phase. Results reported in
[#1](https://github.com/elfensky/aizoban/issues/1), [#2](https://github.com/elfensky/aizoban/issues/2),
[#3](https://github.com/elfensky/aizoban/issues/3); the decision they feed is
[#4](https://github.com/elfensky/aizoban/issues/4) → `docs/decisions/0001-acquisition-make-or-buy.md`.

Run on 2026-08-13, Node 26, macOS. `npm install`, then apply
`patches/runtime-polyfills-interceptor-chain.patch` to `node_modules` (the polyfill passes the
*original* request to every interceptor, dropping earlier mutations — real extensions register
rate-limiter + cookie-store, so this matters before trusting any result).

| Script | What it does |
|---|---|
| `host.mjs` | Minimal Paperback 0.9 host: `ApplicationPolyfill` + `formDidChange` stub + per-stage timeouts + error taxonomy |
| `sweep418.mjs` / `runner-child.mjs` | #3 — every source in the converted registry through search → details → chapters → pages, one child process per source, resumable JSONL |
| `fetch-chapters.mjs` + `works.json` | #1 — full chapter lists for 10 works × up to 10 sources → `fixtures/chapters/` |
| `analyze-drift.mjs` | #1 — pairwise naive number match, drift decomposed into the four flavours |
| `fetch-pages.mjs` / `fetch-pages-all.mjs` | #2 — sample pages (1, N/2, N) and full chapters from paired sources |
| `phash.mjs` / `phash-aligned.mjs` | #2 — pHash/dHash distance distributions, index-based vs content-aligned |

## Results

### #3 — the 418 bet: 222/418 = 53.1% pass end to end

Failure classes: `CLOUDFLARE_CHALLENGE` 64 · `EMPTY_SEARCH` 51 (all retried with real titles —
dead, only 1 recovered) · `EXTENSION_CRASH` 32 · `EMPTY_CHAPTERS` 26 · `NETWORK` 15 ·
`PARSER_CHANGED` 7 · `TIMEOUT` 1. **Zero failures for a missing host ABI.** Excluding
site-side unreachability (Cloudflare + network), **222/339 = 65.5% of reachable sources pass**.
The registry is a *maintained TypeScript source port* (shared theme templates, public `src/`,
PR flow), not one person's binary output — forkable if the maintainer stops.

### #1 — ordinal drift: 10.4% (clean), and worse than the number

19,663 of 136,274 pair-chapters unmatched raw (14.4%); 10.4% after excluding two defective
witnesses. 84% of misses are fractional (split/interstitial), 16% whole-number
(offset/coverage). Control passed: One Piece 5.9%, **all** fractional (genuine omake), zero
whole-number misalignment. Per-work spread: 0.4% (martial-peak) → 37.8% (tales-of-demons).

The number understates the problem in three ways found empirically:

1. **Renumbering is invisible to naive matching.** Tower of God on WeebCentral lists
   `S1/S2/S3 - Chapter N` — 48% of chapter numbers collide across seasons, and against a
   continuously-numbered witness the overlap *aligns numerically while pointing at different
   chapters*. Naive matching doesn't fail there — it silently lies. Only content verification
   catches it (which is what #2 is for).
2. **Identity drift precedes ordinal drift.** 9 of 70 (work, source) search matches were wrong
   series or wrong edition even with exact/prefix matching — "Berserk of Gluttony", "Jujutsu
   Kaisen 0", "Solo Leveling Novel", Kingdom Hearts for Kingdom. MangaDex delists licensed
   series from search and retitles others (*Oshi no Ko* is `【My Star】` there). Fuzzy
   title-linking without verification attaches impostors.
3. **Witness parsers lie.** The converted MangaFox extension returns the *volume* as `chapNum`
   for `Vol.01 Ch.006`-style labels. The raw label holds the truth — which is why fixtures keep
   labels verbatim.

### #2 — pHash separation: clean, with two required refinements

Index-based comparison (pages 1, N/2, N by position) does **not** separate — because sources
insert covers/ads and stitch webtoons differently (same chapter: 11 vs 28 vs 34 pages), and
MangaFreak appends a byte-identical house-ad page across *different works* (the template-page
finding, observed in the wild). Content-aligned comparison (mutual nearest neighbour, template
pages excluded):

| distribution | n | min | med | p95 | max |
|---|---|---|---|---|---|
| same content, different source | 121 | 0 | 6 | 12 | 22 |
| different content | 2,896 | **18** | 30 | 38 | 44 |

**Threshold 14: 1 miss / 121, 0 false accepts / 2,896.** Bubble-text differences between
scanlations move pHash 6–14 bits — comfortably inside the gap. Aggregators frequently serve
byte-identical files (9/54 sample pairs; WeebCentral ≡ MangaPill for two whole works) —
cheap corroboration, but not *independent* testimony.

## Caveats

- One 2026-08-13 snapshot; site availability shifts daily. ComicK caps at 2000 chapters/list.
- `fixtures/pages*/` (copyrighted images) and `bundles/` (GPL-3.0 extension code, never
  redistributed) are gitignored by design; `fixtures/chapters/` (metadata) is committed as the
  regression corpus.
