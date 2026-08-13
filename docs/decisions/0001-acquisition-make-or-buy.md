# 0001 — Acquisition make-or-buy: own JS worker, no Suwayomi sidecar

Date: 2026-08-13 · Status: accepted · Inputs: [#1](https://github.com/elfensky/aizoban/issues/1),
[#2](https://github.com/elfensky/aizoban/issues/2), [#3](https://github.com/elfensky/aizoban/issues/3)
· Method: `probes/phase-0/`

## Decision

**Build acquisition on our own JS worker (Paperback 0.9 host + recipe engine). The Kotlin half
is deleted unbuilt. No Suwayomi sidecar in Phase 1.** Suwayomi remains the documented escape
hatch behind the source-backend interface, with the trigger below.

## Why

The Phase 0 numbers, from `probes/phase-0/README.md`:

- **222/418 (53.1%)** of the converted-Keiyoushi registry passes search → details → chapters →
  pages in a plain-Node host today. Raw, that lands in the "keep a sidecar for the gaps" band —
  but the gap is not what it appears: **64 of 196 failures are Cloudflare**, which a Suwayomi
  sidecar does not solve either (its own docs: KCEF does not bypass). Excluding sites
  unreachable from any architecture, **65.5% of reachable sources pass**, over the 60% bar.
  The browser/solver work is mandatory in every architecture and recovers the same sources for
  the JS path. A sidecar would add a JVM, dex2jar, a patched `android.jar` and X11-in-Docker to
  reach sources we mostly already reach — or genuinely cannot reach from anywhere.
- **Zero failures were a missing host ABI.** The host is ~200 lines plus two known polyfill
  fixes. The risk the sidecar hedged against — "the JS host can't run the corpus" — did not
  materialise.
- **The registry is forkable, not single-sourced.** It is a maintained TypeScript source port
  with public `src/` (shared per-theme templates + per-source config — independently validating
  the Phase 2 recipe design), synced against upstream keiyoushi. Single maintainer, but if they
  stop, we fork source, not reverse-engineer binaries.
- #1 (drift 10.4%, renumber invisible to naive matching) and #2 (pHash separates at t=14 when
  content-aligned) confirm the Census + verification product; the months a sidecar would cost
  are worth more there.

## Trigger for switching

Stand up a **stateless Suwayomi sidecar** as a second source backend if either:

1. after the solver ships, end-to-end pass rate over *reachable* enabled sources stays **< 60%**
   for a month, or
2. PaperbackExt goes **unmaintained ≥ 6 months** while **> 20%** of our enabled sources are
   broken and our fork burns more than ~4 h/month to keep green.

The source-backend interface stays sidecar-shaped (search/details/chapters/pages over a
process boundary) so this is an addition, not a rewrite.

## Consequences

- Phase 1 worker containers: `js-worker` (+ `solver` when the Cloudflare work lands). Nothing
  else.
- Fix in (or upstream to) the polyfills on day one: the interceptor-chain bug and the
  `formDidChange` stub (`probes/phase-0/patches/`).
- The witness-parser defects found in #1 (MangaFox volume-as-chapNum) mean acquisition must
  keep raw chapter labels alongside parsed numbers — parsing is testimony, not truth.
