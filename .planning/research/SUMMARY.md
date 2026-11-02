# Project Research Summary

**Project:** Aizoban
**Domain:** Self-hosted manga acquisition, library and metadata manager (no reader). It feeds Kavita, Komga, Paperback, Panels and Mihon.
**Researched:** 2026-11-02
**Confidence:** MEDIUM

## Executive Summary

Aizoban combines three known tool types: an acquirer (Suwayomi, Tranga), a metadata enricher (Komf) and an arr-style manager (Sonarr, Kapowarr). It adds one thing that no surveyed product has: a verified chapter authority. The arr pattern needs an authoritative list, such as TVDB. Manga has none. So the Census (Work, Witness, Slot, Fill) and cross-source page verification (Assay) are the product. Everything else is commodity and should be built the plain way.

The recommended build is an npm-workspaces monorepo on Node 26. It has three roles in one image: `web` (Next.js 16, UI, Komga and OPDS handlers), an acquire worker (the `js-worker`, with a trusted broker and an untrusted extension child) and an ingest role (validate, assay, build CBZ, land). Postgres 18 holds app data and the pg-boss queue. The staging manifest is the only interface between workers and the app. The staging and library directories sit on one filesystem. All library writes use an intent-logged atomic rename. The schema must have the full Work, Witness, WitnessChapter, Slot and Fill shape from Phase 1, with a degenerate policy. Later phases then change the arbitration, not the shape.

The main risks are these. First, the sandbox cannot wait for Phase 8. Phase 1 already runs untrusted code, so Phase 1 must ship the process boundary, a clean env, no credentials and host-owned HTTP. Second, number-keyed chapter identity fails silently. Slot identity must be an opaque id. Third, the pHash threshold of 14 is less settled than "clean" suggests (the same-content and different-content ranges overlap at 18 to 22 bits). Fourth, the Komga, OPDS-PSE and ComicInfo behaviour is easy to get wrong when it is built from specs instead of captured client traffic. Fifth, two hard rules conflict with the product as planned: "bytes never in web" versus Phase 6 page serving, and "workers are `js-worker` and `solver` only" versus the CBZ build and Assay. Both need an owner decision.

## Key Findings

### Recommended Stack

Details are in `STACK.md`. Versions come from the npm registry on 2026-11-02. Four items need a Phase 1 spike.

**Core technologies:**
- Node 26.13 (LTS), TypeScript **6.0.3** (not 7: `next build` needs the JS compiler API) — newest LTS per Andrei's rule. `js-worker` runs as native TypeScript through type stripping, with no build step.
- Next.js 16.4.4, React 19.3.1, Mantine 9.7.4, `mantine-datatable` — decided, and reused from descent-app.
- PostgreSQL 18.6, `drizzle-orm` 0.45.4 (SQL-like builder only, avoid `db.query`), `pg` 8.23.1 — one driver for app and queue.
- `pg-boss` 12.38.0, exact pin, never below 12.37.1 — queue, cron and per-host cap through `group` + `groupConcurrency`. `singletonKey` is for dedupe only.
- `@paperback/types` and `runtime-polyfills` at exactly **1.0.0-alpha.64**, with the polyfills **vendored** (about 250 lines). The host must replace `scheduleRequest` and persist state, so patching `node_modules` does not work. Do not move to alpha.92.
- Sandbox: `child_process.fork` per extension, `node --permission` with no grants, parent-proxied HTTP over IPC, empty env, separate uid, read-only container. The Node docs call the permission model a "seat belt", so it is one layer only.
- CBZ and ComicInfo: `yazl` (store, no compression), `yauzl`, `fast-xml-parser` (keys in XSD order, with a test), `zod` 4, `sharp` 0.35.5, and the in-house 63-bit pHash with an `algo_version` stored per hash.
- `undici` 8 (parent HTTP), `cheerio` and `yaml` (Phase 2), `pino`, Vitest 5 with Testcontainers, Biome (avoids the `typescript-eslint` TS cap).
- Kavita 0.9.1 (pinned) in Compose behind a `verify` profile. FlareSolverr 3.5.2 or Byparr behind one `SolverClient` URL (Phase 7).

### Expected Features

Details are in `FEATURES.md`.

**Must have (table stakes):**
- Registry with user-supplied repo URL, install, pin and provenance (repo URL, commit, SHA-256, licence).
- Search, details, chapter list and download. Follow, scheduled check and auto-download.
- A download queue with typed failures, plus per-host rate limits and concurrency caps.
- CBZ + `ComicInfo.xml` through stage and atomic rename. One folder per series.
- Series metadata from at least one provider (MangaUpdates, AniList or MangaBaka).
- Komga `/api/v1` (both series endpoints), OPDS and PSE, API keys, content-rating filtering, library import, `docker compose up` with a smoke script.
- Cloudflare handling (Phase 7), source health, notifications and backup (Phase 8).

**Should have (differentiators):**
- The Census: drift reconciliation (offset, split, interstitial, renumber) and evidence-based missing-chapter detection.
- Cross-source verification, as a gate, with quarantine and a review queue. Single-witness chapters get an explicit "unverified" state.
- Per-page quality measurement, credit and ad page detection by recurrence, byte-identical aggregator detection, and a provenance trail.
- Declarative recipes for Madara and MangaThemesia (Phase 2).

**Defer (v2+):**
- Quality-based Fill upgrade (needs trusted Assay data), more than one or two providers, Mihon backup import, notifications and scan pings.
- Never build: a reader, bundled extensions, image recompression on disk, per-user directories, selectors in YAML, tracker or read-progress sync, a metadata editor UI.

### Architecture Approach

Details are in `ARCHITECTURE.md`. Postgres is the single source of truth. The filesystem is a projection that a reaper reconciles. The acquire role sees staging only. The ingest role has library write access and an import mount that is read-only. The web role has the library as read-only. Volume mounts enforce this, not convention. The extension child touches nothing.

**Major components:**
1. `contracts` (zod: manifest, RPC, error taxonomy, `SourceBackend`, job payloads) — the only shared surface. It must be fixed first.
2. `db` and `domain` — Drizzle schema, and pure functions for Census reconcile, label parsing, page alignment, naming and ComicInfo mapping. Phase 0 fixtures become unit tests.
3. `host` — Broker (trusted: egress, rate limit, cookies, state, interceptors) and ext-runner (untrusted child, imports `contracts` only, enforced by a lint boundary).
4. `worker` acquire and ingest roles — fetch into staging, write the manifest last, then validate, assay, verify, build the CBZ and land it.
5. `library-io` — the only code that calls `rename`: fsync, same-device assertion, intent log (`landing` then `landed`), reaper.
6. `web` — UI, Komga and OPDS handlers, Viewer-scoped repositories (no unscoped read is exported), job producer only.

Key patterns: observations are append-only and Slots are derived; per-host queues; the typed error taxonomy is the retry contract; Slot ids and Komga ids are minted once.

### Critical Pitfalls

Full list is in `PITFALLS.md` (35 items).

1. **Sandbox scheduled too late** — Phase 1 runs untrusted code. Ship the process boundary, empty env, no DB credentials, host-owned fetch with SSRF rules, and a hostile-extension test in CI in Phase 1. Phase 8 only hardens.
2. **Chapter identity keyed on number** — use an opaque Slot id. A number is an attribute. Store raw label plus a sortable tuple, not a float. A claim has an evidence state (`proposed`, `corroborated`, `disputed`). Identity of the Work comes before ordinal alignment.
3. **pHash threshold treated as validated** — the ranges overlap at 18 to 22 bits, the margin is 4 bits, and it was fitted on six works. Build a held-out labelled set, add a second signal for the overlap band, exclude low-entropy pages, version the algorithm, and count independent origin clusters (full SHA-256) so byte-identical mirrors give only weak corroboration.
4. **Komga, OPDS-PSE and ComicInfo built from specs** — capture real traffic from Mihon, Paperback 0.9 and Panels and make contract tests. Use golden files and real Kavita and Komga runs. A wrong `Count` marks an ongoing series Completed in Kavita.
5. **Quarantine without a review tool, and an import that reports "done" too early** — build a minimal side-by-side review screen. Drive import "done" from a ledger (zero `unresolved`, zero `failed`, every target re-read).

Also: the polyfill patch is lost on `npm ci` (so vendor it), unpinned extension bundles (run only the stored hash, updates need approval), per-host limits that are only dedupe, junk pages saved as images (validate every image), and the legal posture (empty default registry, store the licence, a purge path).

## Implications for Roadmap

The phases are fixed by the tracker milestones. Research maps onto them as follows. The phase numbers and names do not change.

### Phase 1: skeleton
**Rationale:** Everything depends on `contracts`, the schema shape, the process boundary and the staging contract. Retrofitting any of them touches every later job.
**Delivers:** Issues #5 to #8. Scaffold and queue; hardened host and registry; staging manifest and CBZ landing; Compose end to end with a Kavita smoke script.
**Must carry (beyond the issue text):**
- `contracts` first inside #5. #6 and #7 build against it in parallel.
- The full Work, Witness, WitnessChapter, Slot and Fill schema with a degenerate policy and a stable opaque Slot id. No `source_id` on a library chapter.
- Raw label kept verbatim. Dates nullable (epoch dates become null). `rating` field in the schema and Viewer-scoped repos.
- A real process boundary: empty env, no DB or library mount, host-owned fetch with SSRF rules. A hostile-extension CI test.
- Vendored polyfills with a two-interceptor test. Exact pins.
- A provenance table (repo URL, commit, SHA-256, version, licence). Empty default registry. `.gitignore` secrets entries.
- Typed error taxonomy (add `NEEDS_AUTH` and `HOST_CONTRACT`, an `UNKNOWN` class that alerts), results over IPC.
- Intent-logged landing, same-device assertion, sentinel file, reaper. Image validation and per-page manifest fields. A ComicInfo builder with golden tests.
- pHash spec pinned with unit tests (63-bit, `algo_version`).
- Job-result telemetry, so that Phase 2 can start the canary.
**Spikes:** the four in `STACK.md` (permission model with IPC; `groupConcurrency` across two workers; web producer flags; Kavita first-user register and scan). Also a container-isolation spike for the extension process.
**Avoids:** Pitfalls 3, 5 (tests), 6, 7, 8, 10, 12, 14, 17, 18, 19, 22, 31 to 34.

### Phase 2: recipes
**Rationale:** It needs only the `SourceBackend` interface and can float after Phase 1. It adds sources, not new core concepts.
**Delivers:** A YAML recipe engine for Madara and MangaThemesia. Config only, never selectors. A first-class code escape hatch.
**Must carry:** The update flow (pending state, diff, user approval, dry-run of new chapters). Source alias handling. The daily canary (every installed source, search to pages, results with Node, polyfill and extension versions) as the data source for the decision 0001 switching trigger.
**Uses:** `cheerio`, `yaml`, `zod`.
**Avoids:** Pitfalls 7, 15, 16, and selectors growing in YAML (Anti-Pattern 5 in `ARCHITECTURE.md`).

### Phase 3: library
**Rationale:** Census cannot start before real Works, observations and Fills exist. Import must exercise the landing path.
**Delivers:** Follow, scheduled check, auto-download. Full Work, Witness, Slot, Fill behaviour. Import from the read-only mount. One metadata provider. Stable Komga ids.
**Must carry:** The import ledger (nothing "done" while any row is `unresolved` or `failed`; copy only; byte-safe path builder; NFC; uid and gid). Witness-to-Work link states with evidence (Pitfall 2). Scan-trigger and stable paths. A decision on metadata placement (see open question 3). Provider terms and rate limits checked before work starts.
**Avoids:** Pitfalls 1 (schema), 2, 10, 21, 26, 30.

### Phase 4: census
**Rationale:** First thesis. Number-only matching is blind to renumbering, so the content-aligned compare must exist here.
**Delivers:** Drift reconciliation and evidence-based missing detection. Ship Census v1 as label-and-number alignment that emits `confidence`, `evidence` and an `unverified_alignment` state. Assay then upgrades or downgrades it. Put the pure aligned-compare function in `domain/` in this phase.
**Must carry:** A second parser on raw labels with a per-Witness trust score and a named exclusion config. Identity check before reconciliation. Remap on id change. Tower of God per-season fixture as a regression. Manual override table (merge, split, pin witness) as input, never an edit of derived rows.
**Avoids:** Pitfalls 1, 2, 3, 16.

### Phase 5: assay
**Rationale:** Second thesis. It needs Fills and staging pages. It feeds Census evidence.
**Delivers:** Page measurement, fingerprint storage, content-aligned compare across witnesses, quarantine, credit and ad detection by recurrence, byte-identical origin clusters. Verification is a gate. Single-witness chapters enter as `single-witness` and upgrade later.
**Must carry:** The review screen for quarantine (also the Census override UI). A held-out labelled evaluation set and a second signal for the overlap band. States `verified`, `single-witness`, `weak-corroboration`, `disputed`, `quarantined`. Hold window for new chapters. Cheap checks first. Sticky Fill with hysteresis. `sharp` pixel limits and a precomputed DCT table.
**Avoids:** Pitfalls 4, 5, 9, 19, 20, 24, 25.

### Phase 6: readers
**Rationale:** It needs only stable Work and Fill ids, so it can run parallel to Phases 4 and 5 if household value matters more.
**Delivers:** Komga `/api/v1` (both `GET /series` and `POST /series/list`), then OPDS 1.2 and PSE 1.2, API keys and the Viewer-scoped route matrix.
**Must carry:** Captured real-client traffic as contract tests. Pinned Komga version. A route matrix with a restricted key (404, not 403). PSE page base and declared image types, with a transcode cache. Real Kavita and Komga runs including a series with "Special" in the title. A decision on how page bytes are served (see open question 2).
**Avoids:** Pitfalls 11, 13, 22, 23, 35.

### Phase 7: scale
**Rationale:** Tune what was measured. Do the Cloudflare work only when the pass rate says it pays.
**Delivers:** Queue per site and aperture concurrency, per-class retry tuning, circuit breakers, the Cloudflare solver with identity matching, a source health view.
**Must carry:** One limiter per host in the host-owned fetch (a 429 pauses the host; a 403 opens a breaker; jitter on schedules). A request budget for verification fetches. Solver choice by measuring FlareSolverr and Byparr on the 64 Cloudflare-blocked sources. A "fetch through the solver session" fallback for images.
**Avoids:** Pitfalls 9, 14, 15, 18.

### Phase 8: polish
**Rationale:** Hardening on top of a boundary that already exists.
**Delivers:** Settings forms, uid or container sandbox behind the same RPC, multi-user and API-key UI, notifications and scan pings, backup, optional Mihon backup import, docs.
**Must carry:** A legal read on GPL-3.0 extensions loaded at runtime inside an AGPL host, and on the converted registry used in Phase 0, before any public release. Purge path tested. README non-affiliation statement.
**Avoids:** Pitfalls 6 (hardening), 17, 28.

### Phase Ordering Rationale

- The tracker order holds. Phase 3 before 4 and 5 is right. Phases 4 and 5 are coupled, so share the aligned-compare primitive in `domain/`.
- Phase 6 may run parallel to 4 and 5. That is an owner choice, not a dependency.
- Pull three items out of their nominal phase: sandbox basics (Phase 8 to Phase 1), the pass-rate canary (Phase 7 to Phase 2), and the quarantine review screen (needed in Phase 5, not after).
- Per-host queues, the full schema shape and Viewer-scoped reads are cheap in Phase 1 and expensive later.

### Open Questions for the Owner

These are not settled. Each needs an owner decision before the phase named.

1. **Which process builds the CBZ (before Phase 1, issue #7)?** Issue #7 says "the app builds CBZ". Building reads every page byte, so the web process would break the hard rule. `ARCHITECTURE.md` suggests an ingest role in the same image with different mounts. `STACK.md` suggests pg-boss queues consumed by the `js-worker` parent. Decision 0001 says workers are `js-worker` and `solver` only. A short ADR is needed whichever way it goes. The same answer covers Assay fingerprinting in Phase 5.
2. **How does Phase 6 serve page bytes (before Phase 6)?** Komga page and file endpoints and PSE must return image bytes. Literal reading of "bytes never pass through the web process" forbids it. Options: (a) narrow the rule to acquisition bytes and stream landed files from a read-only mount with Range support and pre-generated thumbnails; (b) hand off to a reverse proxy with `X-Accel-Redirect`; (c) add a small media process. Note that (a) and (b) change the wording in `AGENTS.md`, and (c) adds a role beyond decision 0001. Pitfalls leans to (b) or (c); Architecture leans to (a).
3. **Where does provider metadata live (before Phase 3 schema freeze)?** No phase names it, yet the product is a "metadata manager". Options: put one provider in Phase 3, or add scope elsewhere. Needs a first-provider choice and a field-level provenance and "locked by user" design.
4. **Per-host concurrency design (Phase 1 spike result).** `STACK.md` recommends `group` + `groupConcurrency`. `ARCHITECTURE.md` recommends a queue per host and notes the docs did not confirm group concurrency. The spike decides.
5. **Slot id stability across Census re-runs (before Phase 4).** A matching rule and a file-rename policy are needed so that Fill ids and Komga book ids never change.
6. **Phase 6 relative to Phases 4 and 5.** Run in parallel for earlier household value, or keep the order.
7. **Small clarifications:** correct "64-bit" to "63-bit" in `AGENTS.md`, or change the hash. Biome versus adding ESLint for Next-specific rules.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase <N>`):
- **Phase 1:** four spikes, and extension container isolation. Standard patterns, but details matter.
- **Phase 4:** matching algorithm and evidence model. This is design work on the Phase 0 fixtures, not a library search. Also check Suwayomi duplicate and multi-scanlator handling.
- **Phase 5:** labelled evaluation set and a second signal for the overlap band.
- **Phase 6:** highest uncertainty. Capture real Mihon, Paperback 0.9 and Panels traffic against real Komga and Kavita. Re-read the Komga deprecation page. Verify PSE page numbering per client. Verify Komf compatibility with an emulated API.
- **Phase 7:** Cloudflare solver and `cf_clearance` identity (UA, IP, TLS). Confirm pg-boss group concurrency in the pinned version.
- **Phase 3 (partial):** provider terms and rate limits before provider work.

Phases with standard patterns (skip research-phase):
- **Phase 2:** well-understood CMS templates, cheerio and YAML. Only the update flow and canary need design, not research.
- **Phase 8:** standard work, except the licence question, which needs a legal read, not research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Versions verified on npm and in official docs on 2026-11-02. Four items need spikes. Permission-model effectiveness and pg-boss group concurrency are MEDIUM. Solver choice is LOW-MEDIUM. |
| Features | MEDIUM | Competitor claims come from READMEs. The Komga API surface, Komf compatibility and Suwayomi duplicate handling are unverified (LOW). |
| Architecture | MEDIUM | Repo rules and Phase 0 numbers are HIGH. Component boundaries are informed design. Comparable-system patterns are mostly training knowledge. |
| Pitfalls | MEDIUM | Phase 0 and audit findings are HIGH. Many client behaviours (Kavita, Komga, Mihon, Paperback) are untested hypotheses marked `[K]`. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Komga endpoint inventory and response shapes:** not verified. Capture real traffic in Phase 6 planning.
- **Komga deprecation timeline:** direct fetch of the page returned 404. Re-read before Phase 6.
- **pg-boss group concurrency and `singletonKey` semantics:** docs thin. Phase 1 spike. Pin exactly.
- **Permission model plus IPC with no grants:** assumed to work. Phase 1 spike.
- **Kavita first-user registration on a fresh DB:** assumed. Phase 1 spike.
- **TypeScript 7 and Next:** rests on secondary reports. Re-check before any upgrade.
- **pHash threshold:** fitted on six works. Phase 5 held-out evaluation.
- **FlareSolverr status:** third-party blogs conflict with the repo release log. Measure in Phase 7.
- **Provider terms, volume mapping, Komf compatibility:** unexamined. Keep the Slot schema able to carry a volume.
- **Licence of the converted registry and GPL-3.0 at runtime inside AGPL:** open legal question. Not legal advice. Resolve before any public release.
- **Phase 0 headline numbers:** several are one-day snapshots or fitted (10.4%, threshold 14). Use as planning inputs, not gates. Re-run the 418-source sweep on Node 26 before gating on it.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`, 2026-11-02) — all pinned versions.
- pg-boss API docs (queues, workers, jobs, constructor) and releases — retry, `group`, `groupConcurrency`, constructor flags, 12.37.1 and 12.38.0 changes.
- Node 26 docs (permissions, TypeScript, `vm`, previous releases) — "seat belt" wording, `--allow-net` all-or-nothing, `_debugProcess` gap, type stripping.
- PostgreSQL versioning page — 18.6 current, 19 at RC1.
- ComicInfo 2.1 draft XSD and Kavita metadata and scanner wiki pages — element order, enums, `Count` and `Format` semantics, minute-granularity scan check.
- OPDS-PSE 1.2 spec — numbering inconsistency, image types.
- MangaDex API limitations page — rate limits, ban behaviour, hotlinking.
- Mihon news 2025-11-05 — takedown and distribution lessons.
- Phase 0 probes, `AGENTS.md`, `.planning/PROJECT.md`, decision 0001, `.planning/codebase/CONCERNS.md` — first-party measurements.

### Secondary (MEDIUM confidence)
- Suwayomi-Server, Tranga, Komf, Kaizoku READMEs — competitor features.
- `r52/gagaku` (MIT) — extension host with the polyfill gaps filled.
- Komga API docs and Komga OPDS guide — auth and OPDS path (endpoint inventory not read).
- FlareSolverr and Byparr repositories — API and licence.
- Next.js TypeScript 7 reports (vercel/next.js #96110, #95633) — secondary but consistent.
- Tachiyomi source-id derivation (via mirrored commit).

### Tertiary (LOW confidence)
- Cloudflare solver blog comparisons — used only to name candidates.
- Basedash on pg-boss singleton behaviour — third-party, verify.
- TorrentFreak and DMCA coverage — search summaries only.
- Training knowledge for Sonarr, Komga response shapes, reader behaviour on replaced files, NFS and inotify — hypotheses to test in the named phase.

Full source lists with archive links are in `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md` and `PITFALLS.md` in this folder.

---
*Research completed: 2026-11-02*
*Ready for roadmap: yes*
