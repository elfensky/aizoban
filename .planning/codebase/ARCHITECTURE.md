---
last_mapped_commit: 035a59a331061875257f45c83895c44d3cd9aad7
last_mapped_at: 2026-11-02
---
<!-- refreshed: 2026-11-02 -->
# Architecture

**Analysis Date:** 2026-11-02

## Status Summary

**Present in the repository today:** documents and Phase 0 measurement scripts only.
There is no application runtime, no web process, no database layer, and no worker process.
The only executable code lives in `probes/phase-0/`.

**Planned (not present):** the product architecture described in `AGENTS.md`, `README.md` and
`docs/decisions/0001-acquisition-make-or-buy.md`. Every planned item below is marked **(planned)**.

## System Overview

```text
 PRESENT (Phase 0, measurement only)
┌──────────────────────────────────────────────────────────────────┐
│  probes/phase-0/  (Node ESM scripts, run by hand)                 │
│                                                                    │
│  fetch-chapters.mjs ─┐                                             │
│  sweep418.mjs ──► runner-child.mjs ──► host.mjs                    │
│  fetch-pages*.mjs ───┤         (vm sandbox + polyfills)           │
│                      ▼                                             │
│  fixtures/chapters/*.json   fixtures/pages*/  (gitignored images)  │
│  analyze-drift.mjs, phash.mjs, phash-aligned.mjs                   │
│                      ▼                                             │
│  results/*.jsonl, results/drift-report.json                        │
└──────────────────────────────────────────────────────────────────┘
        │ fetches bundles over HTTPS from extension registries
        ▼
 External: inkdex.github.io, nicartjay.github.io (Paperback 0.9 extension registries)

 PLANNED (not present)
┌──────────────────────────────────────────────────────────────────┐
│  Next.js web process  (API, Komga/OPDS, UI)                        │
│  - reads staging manifests, never image bytes                      │
└───────────────┬──────────────────────────────────▲───────────────┘
                │ pg-boss jobs                      │ Postgres reads
                ▼                                   │
┌───────────────────────────────┐   ┌──────────────┴───────────────┐
│ js-worker (acquisition)        │   │ Postgres                      │
│  - Paperback host, recipe engine│   │  Work / Witness / Slot / Fill│
│  - extension sandbox (no DB,    │──►│                              │
│    no FS) — planned             │   └──────────────────────────────┘
└───────────────┬───────────────┘
                │ writes to staging + manifest
                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Staging dir → atomic rename → canonical library (CBZ + ComicInfo)│
│  Read-only import mount is copied from, never written to          │
└──────────────────────────────────────────────────────────────────┘
        ▲
        │  solver (planned, when Cloudflare work lands)
```

## Pattern Overview

**Overall (present):** Script-per-experiment measurement harness. Each `.mjs` file is a
standalone CLI. Shared logic is limited to `host.mjs`. Scripts persist state as files
(JSONL, JSON fixtures) and are resumable by skipping recorded IDs.

**Overall (planned):** Process-separated pipeline. A Next.js web process reads Postgres and
staging manifests. One or more worker processes (`js-worker`, optional `solver`) run
acquisition jobs through `pg-boss`. Image bytes never pass through the web process.

**Key Characteristics (present):**
- Plain Node ESM (`"type": "module"` in `probes/phase-0/package.json`), no build step.
- No test runner. `probes/phase-0/package.json` `test` script is a placeholder.
- Each heavy or risky unit runs in a child process so a pathological extension can be killed
  (`probes/phase-0/sweep418.mjs` forks `probes/phase-0/runner-child.mjs`).
- Per-stage timeouts and error classification live in `probes/phase-0/host.mjs`
  (`withTimeout`, `classifyError`, `STAGE_TIMEOUT_MS = 45_000`).

**Key Characteristics (planned):**
- Work → Witness → Slot → Fill data model ("the Census"). Sources testify about chapters;
  the product arbitrates.
- Verification without a reader: content-aligned perceptual-hash comparison across sources.
- Sandboxed extension execution. `node:vm` is **not** a security boundary (`AGENTS.md`).
- Stage-then-atomic-rename for every write to the library.
- One canonical library on disk. Per-user libraries are API projections, not directories.

## Layers

**Measurement host (present):**
- Purpose: load a Paperback 0.9 extension bundle and run it through search → details →
  chapters → pages.
- Location: `probes/phase-0/host.mjs`, `probes/phase-0/runner-child.mjs`
- Contains: `loadExtension`, `runChain`, `classifyError`, `withTimeout`
- Depends on: `@paperback/runtime-polyfills`, `@paperback/types` (`probes/phase-0/package.json`),
  Node `vm`, global `fetch`
- Used by: `probes/phase-0/sweep418.mjs`, `probes/phase-0/fetch-chapters.mjs`,
  `probes/phase-0/fetch-pages.mjs`, `probes/phase-0/fetch-pages-all.mjs`

**Sweep orchestration (present):**
- Purpose: run every registry source through the chain, one child per source, resumable.
- Location: `probes/phase-0/sweep418.mjs`
- Depends on: `probes/phase-0/runner-child.mjs`, registry `versioning.json`
- Output: `probes/phase-0/results/sweep418.jsonl`, `probes/phase-0/results/empty-search-ids.txt`,
  `probes/phase-0/results/retry-empty.jsonl`

**Fixture capture (present):**
- Purpose: fetch chapter lists and sample/full page sets for analysis.
- Location: `probes/phase-0/fetch-chapters.mjs` (reads `probes/phase-0/works.json`),
  `probes/phase-0/fetch-pages.mjs`, `probes/phase-0/fetch-pages-all.mjs`
- Output: `probes/phase-0/fixtures/chapters/` (committed), `probes/phase-0/fixtures/pages/`
  and `probes/phase-0/fixtures/pages-full/` (gitignored)

**Analysis (present):**
- Purpose: quantify ordinal drift and perceptual-hash separation.
- Location: `probes/phase-0/analyze-drift.mjs`, `probes/phase-0/phash.mjs`,
  `probes/phase-0/phash-aligned.mjs`
- Depends on: fixtures above; `sharp` (image hashing)
- Output: `probes/phase-0/results/drift-report.json`, printed summaries

**Acquisition worker (planned):**
- Purpose: Paperback 0.9 host plus recipe engine; runs extensions, fetches chapters and pages,
  writes to staging with a manifest.
- Location: not yet created. Decision `docs/decisions/0001-acquisition-make-or-buy.md`.
- Depends on: `pg-boss` queue, source-backend interface (sidecar-shaped)

**Web process (planned):**
- Purpose: Komga-compatible API, OPDS/OPDS-PSE, UI, per-user API-key scoping.
- Location: not yet created. Stack per `AGENTS.md`: Next.js + TypeScript + Postgres.
- Depends on: Postgres, staging manifests (never pixels)

**Solver (planned):** Cloudflare challenge handling, only when that work lands.

## Data Flow

### Measurement Flow (present): 418-source sweep

1. `probes/phase-0/sweep418.mjs` fetches `versioning.json` from the registry base URL
   (default `https://nicartjay.github.io/PaperbackExt/0.9/stable`, overridable with `--registry`).
2. It skips IDs already in `results/sweep418.jsonl`, then forks one `runner-child.mjs` per source
   (concurrency default 8).
3. `runner-child.mjs` fetches `<registry>/<sourceId>/index.js`, calls `loadExtension`
   (`vm.createContext` inside `ApplicationPolyfill`), then `runChain`.
4. The child prints one JSON line. The parent appends it to `results/sweep418.jsonl`.

### Fixture and Drift Flow (present)

1. `probes/phase-0/fetch-chapters.mjs` reads `works.json`, caches each bundle in
   `probes/phase-0/bundles/` (gitignored), and runs search → chapters for each work × source.
2. Raw chapter labels are written verbatim to `probes/phase-0/fixtures/chapters/<work>--<source>.json`.
3. `probes/phase-0/analyze-drift.mjs` groups fixtures by work and matches chapter numbers pairwise.
4. Output goes to `probes/phase-0/results/drift-report.json`.

### Page Verification Flow (present, experimental)

1. `fetch-pages.mjs` / `fetch-pages-all.mjs` write images to `fixtures/pages*/`.
2. `phash-aligned.mjs` computes pHash per page, takes mutual nearest neighbours between two
   sources, and excludes template pages that recur across works.
3. Threshold separation is reported in `probes/phase-0/README.md` (threshold 14 bits).

### Acquisition to Library Flow (planned)

1. Web process or scheduler enqueues an acquisition job on `pg-boss`.
2. `js-worker` runs the extension in its sandbox, records **raw labels plus parsed numbers**
   as Witness data.
3. Worker writes page images to a staging directory and writes a manifest.
4. The app reads the manifest, verifies the chapter against other witnesses, and fills the Slot.
5. The chapter is written as CBZ + `ComicInfo.xml` to staging, then atomically renamed into the
   canonical library.
6. Komga/OPDS readers see the library through the web process. Per-user views are API projections.

**State Management:**
- Present: state is held in files. JSONL records make sweeps resumable. No shared in-memory state
  across scripts.
- Planned: Postgres holds Work / Witness / Slot / Fill. `pg-boss` holds job state.

## Key Abstractions

**Paperback extension bundle (present, external):**
- Purpose: third-party source code that implements search, details, chapters and pages.
- Examples: loaded from `<registry>/<sourceId>/index.js` in `probes/phase-0/runner-child.mjs`
- Pattern: evaluated in a `vm` context with a curated global set (`probes/phase-0/host.mjs`).

**Stage result record (present):**
- Purpose: one line per source with `ok`, `stage`, `class`, `error`, `ms`.
- Examples: `probes/phase-0/results/sweep418.jsonl`
- Pattern: error classes such as `CLOUDFLARE_CHALLENGE`, `EMPTY_SEARCH`, `EXTENSION_CRASH`,
  `EMPTY_CHAPTERS`, `NETWORK`, `PARSER_CHANGED`, `TIMEOUT`.

**Source-backend interface (planned):**
- Purpose: search / details / chapters / pages behind one interface, shaped so a Suwayomi
  sidecar can be added later without a rewrite.
- Examples: not yet created. Defined in `docs/decisions/0001-acquisition-make-or-buy.md`.
- Pattern: process-boundary-friendly (`docs/decisions/0001`).

**Work → Witness → Slot → Fill (planned):**
- Purpose: model the chapter census. A Work has Witnesses (sources). Each Witness testifies about
  chapters. A Slot is a canonical chapter position. A Fill is a verified acquired file for a Slot.
- Examples: not yet created. Defined in `AGENTS.md` ("The Census").
- Pattern: never model "chapters belonging to a source".

**YAML site definition (planned):**
- Purpose: declarative config for common CMS templates.
- Rule: YAML carries config, never selectors. Identity and capability are data; behaviour is code.
- Examples: not yet created.

## Entry Points

**Phase 0 probes (present):**
- `probes/phase-0/sweep418.mjs`: full registry sweep. Invoked with `node sweep418.mjs [--registry] [--concurrency] [--only]`.
- `probes/phase-0/runner-child.mjs`: child process only. Takes `<registry> <sourceId> [queries]`.
- `probes/phase-0/fetch-chapters.mjs`: chapter fixtures. Options `--only`, `--source`.
- `probes/phase-0/fetch-pages.mjs`, `probes/phase-0/fetch-pages-all.mjs`: page fixtures.
- `probes/phase-0/analyze-drift.mjs`, `probes/phase-0/phash.mjs`, `probes/phase-0/phash-aligned.mjs`: analysis.

**Web process (planned):**
- Location: not yet created.
- Triggers: HTTP requests from Komga/OPDS clients and the UI.

**js-worker (planned):**
- Location: not yet created.
- Triggers: `pg-boss` jobs.

## Architectural Constraints

- **Threading:** Single-threaded Node event loop in each probe. Parallelism comes from forked
  child processes (`probes/phase-0/sweep418.mjs`). No worker threads are used.
- **Global state:** `probes/phase-0/host.mjs` creates a fresh `ApplicationPolyfill()` per loaded
  extension. No module-level mutable singleton beyond the per-script `done` set in
  `probes/phase-0/sweep418.mjs`.
- **Circular imports:** None. Imports flow `runner-child.mjs` → `host.mjs`; scripts import `host.mjs`
  and do not import one another.
- **Sandbox:** `probes/phase-0/host.mjs` uses `node:vm` and states it is "fine here" because it is
  a measurement script. Planned product sandbox must be a separate process with no DB and no
  filesystem access (`AGENTS.md`, Hard rules).
- **Image bytes:** Probes write images to disk freely. Planned product rule: image bytes never
  pass through the web process.
- **Extension licensing:** `probes/phase-0/bundles/` holds GPL-3.0 extension code and is gitignored.
  Planned product rule: never bundle extensions. Sources are added at runtime from a repo URL.
- **Patched dependency:** Probes require `probes/phase-0/patches/runtime-polyfills-interceptor-chain.patch`
  applied to `node_modules`. Without it, interceptor mutations are lost.

## Anti-Patterns

### Using `node:vm` as the extension sandbox

**What happens:** `probes/phase-0/host.mjs` runs untrusted bundles in `vm.createContext` inside
the same process as the host.
**Why it's wrong:** `AGENTS.md` states `node:vm` is not a security boundary. Extensions are
untrusted third-party code.
**Do this instead (planned):** run extensions in a separate sandboxed process with no database
and no filesystem access. Keep the probe pattern only for measurement.

### Index-based page comparison

**What happens:** comparing pages 1, N/2, N by position.
**Why it's wrong:** sources insert covers and ads differently. The probe showed index-based
comparison does not separate (`probes/phase-0/README.md`).
**Do this instead:** content-aligned comparison with mutual nearest neighbours, as in
`probes/phase-0/phash-aligned.mjs`, with template pages excluded first.

### Trusting parsed chapter numbers

**What happens:** storing only `chapNum` from a witness parser.
**Why it's wrong:** the MangaFox witness returns volume as chapter (`probes/phase-0/README.md`).
**Do this instead:** keep raw labels verbatim, as `probes/phase-0/fetch-chapters.mjs` does, and
store parsed numbers beside them.

## Error Handling

**Strategy (present):** Errors are caught per stage, classified, and recorded as data rather than
thrown to the top level.

**Patterns:**
- `classifyError(err, stage)` in `probes/phase-0/host.mjs` maps errors to a class.
- `withTimeout` wraps every stage with a 45 s limit.
- `runner-child.mjs` always prints one JSON line, even on failure, and exits 0.

**Strategy (planned):** error handling that prevents data loss takes priority. The product never
reports an import as "done" while anything is unresolved (`AGENTS.md`).

## Cross-Cutting Concerns

**Logging (present):** `console.log` JSON lines to stdout (probes). Progress uses plain `console`.

**Validation (present):** Chapter numbers are checked with `Number.isFinite`; unparseable labels
are counted (`probes/phase-0/analyze-drift.mjs`).

**Validation (planned):** validation at trust boundaries (extension output, YAML definitions).

**Authentication (present):** none. Extension registries are public HTTPS. Probes send no
credentials.

**Authentication (planned):** per-user API keys scope library views (`README.md`, multi-user,
single-tenant).

---

*Architecture analysis: 2026-11-02*
