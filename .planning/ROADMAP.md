# Roadmap: Aizoban

## Overview

Aizoban downloads manga through the community extension ecosystem, works out what each chapter really is, and serves one verified library to the readers people already use. Phase 0 (de-risk, tracker milestone 1) is done: it was measured on 2026-08-13 and it is not a roadmap phase. The eight phases below are the tracker milestones 2 to 9, with the same numbers and names. Phase 1 builds one thin vertical slice, search to download to a file that Kavita opens, with the process boundary and staging contract already real. Phase 2 adds sources by recipe, with no code. Phase 3 builds the Work, Witness, Slot, Fill library and the import. Phases 4 and 5 are the two theses: the Census builds the chapter authority, and the Assay verifies every chapter across sources. Phase 6 serves the library to Mihon, Paperback and OPDS clients. Phase 7 makes it survive real hosts for a week without supervision. Phase 8 hardens and documents it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work. They mirror the tracker milestones in `elfensky/aizoban`.
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: skeleton** - One chapter from a website into a file Kavita opens, with the boundaries real
- [ ] **Phase 2: recipes** - Paste a Madara or MangaThemesia URL and get a working source with no code
- [ ] **Phase 3: library** - Work / Witness / Slot / Fill, follow and auto-download, import of an existing library
- [ ] **Phase 4: census** - One canonical chapter list per series, with evidence-based missing detection
- [ ] **Phase 5: assay** - Every page measured and compared across sources; disagreeing chapters quarantined
- [ ] **Phase 6: readers** - Komga `/api/v1` and OPDS/PSE so Mihon, Paperback and others browse the library
- [ ] **Phase 7: scale** - Per-host queues, typed retry, Cloudflare solver, a week unattended
- [ ] **Phase 8: polish** - Settings forms, hardened sandbox, users and API keys UI, docs

## Phase Details

### Phase 1: skeleton
**Goal**: One chapter, from a website, into a file Kavita opens, with every part as thin as possible but the process boundary, staging contract and schema shape already real.
**Mode:** mvp
**Tracker:** [milestone 2](https://github.com/elfensky/aizoban/milestone/2); issues #5 (scaffold, FOUND), #6 (js-worker and registry, HOST), #7 (staging contract and landing, STAGE), #8 (compose end to end, DEPL)
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, HOST-01, HOST-02, HOST-03, HOST-04, HOST-05, HOST-06, HOST-07, HOST-08, STAGE-01, STAGE-02, STAGE-03, STAGE-04, STAGE-05, DEPL-01, DEPL-02, DEPL-03
**Success Criteria** (what must be TRUE):
  1. On a fresh checkout, `docker compose up` starts the app, `js-worker`, Postgres, a shared library volume and Kavita; the app healthcheck passes, a trivial job round-trips through pg-boss on a per-host queue, and the vitest suite runs green.
  2. Exit: the operator adds an extension repository by URL, installs an extension (repository URL, commit hash and version are recorded; nothing ships preinstalled), searches a source keyed by (extension package, class name), picks a manga, downloads one chapter, and Kavita opens it.
  3. A hostile test extension cannot read the environment, files, the database or open its own sockets; a crashed extension does not stop the worker; extension state survives a worker restart; a search with no hits returns an empty result; a test with two interceptors proves both polyfill fixes.
  4. A downloaded chapter lands as a CBZ with a correct `ComicInfo.xml` by stage and atomic rename, recorded against an opaque Slot of a Work (not against a source) with its raw chapter label stored verbatim; landing the same chapter again changes nothing; the web process read the manifest and no page bytes.
  5. A headless smoke script runs search, download and Kavita open end to end and exits 0; a forced failure shows a typed class with its retry policy (`PARSER_CHANGED` retries 0 times).
**Must carry**:
  - `contracts` (zod: manifest, RPC, error taxonomy, `SourceBackend`, job payloads) first inside #5; #6 and #7 build against it in parallel.
  - Full Work, Witness, WitnessChapter, Slot, Fill schema with a degenerate policy and a stable opaque Slot id; no `source_id` on a library chapter; nullable dates (epoch becomes null); `rating` field and Viewer-scoped repositories.
  - Real process boundary now, not in Phase 8: empty env, no DB or library mount, host-owned fetch with SSRF rules, a hostile-extension test in CI.
  - Polyfills vendored at exactly `1.0.0-alpha.64` with exact pins; the worker runs only the stored bundle hash; a provenance table (repo URL, commit, SHA-256, version, licence); empty default registry; `.gitignore` secrets entries.
  - Error taxonomy adds `NEEDS_AUTH`, `HOST_CONTRACT` and an alerting `UNKNOWN`; results travel over IPC.
  - Intent-logged landing, same-device assertion, sentinel file, reaper; image validation and per-page manifest fields; a ComicInfo builder with golden tests; pHash spec pinned with unit tests (63-bit, `algo_version`); job-result telemetry so Phase 2 can start the canary.
  - Open owner decision before #7: which process builds the CBZ (see STATE.md).
**Research**: Needed. Four spikes (permission model with IPC; `groupConcurrency` across two workers; web producer flags; Kavita first-user register and scan) plus extension container isolation.
**Plans**: TBD

### Phase 2: recipes
**Goal**: A user pastes a Madara or MangaThemesia site URL and gets a working source with no code, from YAML that carries config only.
**Mode:** mvp
**Tracker:** [milestone 3](https://github.com/elfensky/aizoban/milestone/3)
**Depends on**: Phase 1 (needs only the `SourceBackend` interface)
**Requirements**: RCPE-01, RCPE-02, RCPE-03, RCPE-04
**Success Criteria** (what must be TRUE):
  1. Pasting a Madara or MangaThemesia URL detects the template and configures a source that completes search, details, chapter list and pages with no code.
  2. Exit: of ten unknown Madara URLs, at least six become working sources with no code.
  3. A recipe holds identity and capability only; a recipe that contains a selector is rejected, and a recipe can name a code escape hatch that is a first-class path.
  4. A daily canary runs every installed source from search to pages and records pass or fail with the Node, polyfill and extension versions, so the decision 0001 switching trigger has data.
**Must carry**:
  - The extension update flow beyond the Phase 1 approval gate: pending state, diff, user approval, dry-run of new chapters; source alias handling.
  - Selectors must not grow inside YAML (Anti-Pattern 5 in `research/ARCHITECTURE.md`).
**Research**: Not needed (standard CMS templates, `cheerio`, `yaml`, `zod`). The update flow and canary need design, not research.
**Plans**: TBD
**UI hint**: yes

### Phase 3: library
**Goal**: Sources point into one chapter list per series instead of owning private copies, and a user can import an existing library from a read-only mount without losing anything.
**Mode:** mvp
**Tracker:** [milestone 4](https://github.com/elfensky/aizoban/milestone/4)
**Depends on**: Phase 1 (Phase 2 adds sources but is not required)
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06
**Success Criteria** (what must be TRUE):
  1. Exit: a real library is imported from a read-only mount, matched, and re-filed under a new path template, and nothing is lost.
  2. An import never says "done" while any item is unresolved or failed, and the import mount is byte-for-byte unchanged afterwards.
  3. A user follows a series; a scheduled check finds new chapters from its witnesses and downloads them automatically.
  4. A series with two sources shows one chapter list, and each source appears as a witness pointing into it (Witness to Slot to Fill), with no per-source chapter copies.
  5. A followed series shows title, alternative titles, summary, status, genres and cover from one external provider.
**Must carry**:
  - Import ledger: copy only; byte-safe path builder; NFC; uid and gid; "done" only at zero `unresolved` and zero `failed`, with every target re-read.
  - Witness-to-Work link states with evidence; scan trigger and stable paths so reader ids do not change.
  - Open owner decision before the schema freeze: where provider metadata lives, which provider, and field-level provenance with "locked by user" (see STATE.md). Check provider terms and rate limits before provider work starts.
**Research**: Partial. Provider terms and rate limits before provider work.
**Plans**: TBD
**UI hint**: yes

### Phase 4: census
**Goal**: The app builds its own chapter authority: it reconciles drift across witnesses into one canonical chapter list and reports missing chapters only from witness evidence.
**Mode:** mvp
**Tracker:** [milestone 5](https://github.com/elfensky/aizoban/milestone/5)
**Depends on**: Phase 3
**Requirements**: CENS-01, CENS-02, CENS-03, CENS-04, CENS-05, CENS-06, CENS-07
**Success Criteria** (what must be TRUE):
  1. Exit: a series with a split chapter, an omake and a Part-2 renumber reconciles correctly and reports zero false missing chapters; `probes/phase-0/fixtures/chapters/` runs as the regression corpus.
  2. Every witness shows a reconciliation map from its labels to canonical Slots, with the evidence for each alignment.
  3. The missing-chapter report cites witness evidence for each gap and never uses the tracker's chapter count.
  4. A per-season renumbered witness (the Tower of God fixture) is aligned by content verification, not number agreement, and a wrong-series or wrong-edition witness never joins the Work.
  5. A user merges, splits or pins a witness, and the override survives the next reconciliation run.
**Must carry**:
  - Census v1 ships as label-and-number alignment that emits `confidence`, `evidence` and an `unverified_alignment` state; Phase 5 upgrades or downgrades it. The pure aligned-compare function lives in `domain/` in this phase.
  - A second parser on raw labels with a per-Witness trust score and a named exclusion config; identity check before reconciliation; remap on id change.
  - Overrides are an input table (merge, split, pin witness), never an edit of derived rows.
  - Open owner decision before this phase: Slot id stability across re-runs, so Fill ids and Komga book ids never change.
**Research**: Needed. Matching algorithm and evidence model, designed on the Phase 0 fixtures; check Suwayomi duplicate and multi-scanlator handling.
**Plans**: TBD
**UI hint**: yes

### Phase 5: assay
**Goal**: Every chapter is checked without a reader: pages are measured and fingerprinted on arrival, compared across witnesses, and chapters that disagree are quarantined before they reach the library.
**Mode:** mvp
**Tracker:** [milestone 6](https://github.com/elfensky/aizoban/milestone/6)
**Depends on**: Phase 4 (shares the aligned-compare primitive; needs Fills and staged pages)
**Requirements**: ASSY-01, ASSY-02, ASSY-03, ASSY-04, ASSY-05, ASSY-06, ASSY-07
**Success Criteria** (what must be TRUE):
  1. Exit: a placeholder-page chapter and a wrong-series chapter fed in deliberately are both caught and quarantined with nobody looking.
  2. Every arriving page is measured for dimensions, JPEG quantisation quality and upscale, and the result is stored.
  3. A chapter whose witnesses agree on content-aligned comparison (template pages excluded first, page-count guard for stitched webtoons) becomes verified; one whose witnesses disagree is quarantined; a chapter with one witness is marked unverified and is never passed silently.
  4. Credit and ad pages are excluded by fingerprint recurrence with no ML, and byte-identical copies from aggregators count as one origin, not as independent witnesses.
  5. A user opens a quarantined chapter, compares witnesses side by side, and accepts it, rejects it or swaps the witness.
**Must carry**:
  - The review screen doubles as the Census override UI.
  - A held-out labelled evaluation set and a second signal for the pHash overlap band (same-content and different-content ranges overlap at 18 to 22 bits); states `verified`, `single-witness`, `weak-corroboration`, `disputed`, `quarantined`; hold window for new chapters; cheap checks first; sticky Fill with hysteresis; `sharp` pixel limits and a precomputed DCT table.
  - The CBZ-build process answer from Phase 1 also decides where fingerprinting runs.
**Research**: Needed. Labelled evaluation set and a second signal for the overlap band.
**Plans**: TBD
**UI hint**: yes

### Phase 6: readers
**Goal**: Readers the household already uses connect to Aizoban and browse one verified library, through Komga `/api/v1` emulation and OPDS/PSE.
**Mode:** mvp
**Tracker:** [milestone 7](https://github.com/elfensky/aizoban/milestone/7)
**Depends on**: Phase 3 (needs only stable Work and Fill ids; Phases 4 and 5 are not prerequisites, so it may run in parallel with them if the owner chooses)
**Requirements**: READ-01, READ-02, READ-03, READ-04, READ-05
**Success Criteria** (what must be TRUE):
  1. Exit: Mihon (deprecated `GET /api/v1/series`) and Paperback 0.9 (`POST /api/v1/series/list`) both connect and browse the library, with no extension written by us.
  2. Panels, KOReader, Thorium and Moon+ read the library through OPDS 1.2 and PSE 1.2.
  3. A chapter that is not downloaded yet has a PSE link, and opening it fetches the chapter on demand.
  4. A reader that authenticates with a per-user API key sees a projection of the one library filtered by content rating; a restricted key gets 404, not 403, for hidden items.
**Must carry**:
  - Captured real-client traffic (Mihon, Paperback 0.9, Panels) as contract tests; pinned Komga version; real Kavita and Komga runs including a series with "Special" in the title.
  - PSE page base and declared image types, with a transcode cache; a route matrix for the Viewer-scoped API keys. API-key management UI is Phase 8 (POL-03).
  - Open owner decision before this phase: how page bytes are served under "image bytes never pass through the web process" (see STATE.md).
**Research**: Needed, and highest uncertainty. Capture real client traffic against real Komga and Kavita; re-read the Komga deprecation page; verify PSE page numbering per client and Komf compatibility.
**Plans**: TBD

### Phase 7: scale
**Goal**: Aizoban runs unattended against real hosts: each host has its own queue and limits, failures retry by class, and Cloudflare-blocked sources work.
**Mode:** mvp
**Tracker:** [milestone 8](https://github.com/elfensky/aizoban/milestone/8)
**Depends on**: Phase 5 (Phase 2 canary supplies the pass-rate data)
**Requirements**: SCAL-01, SCAL-02, SCAL-03, SCAL-04, SCAL-05
**Success Criteria** (what must be TRUE):
  1. Exit: a week-long unattended run shows no starvation, no silent corruption and no bans.
  2. Each source host has its own queue; when one host answers 429 or 403, its concurrency narrows and other hosts are unaffected.
  3. Failures retry by typed class: transient classes back off and retry, `PARSER_CHANGED` does not retry, and the failure counts by class are visible.
  4. A source that Cloudflare blocked before now completes through the `solver` worker, with cookies, user agent and TLS fingerprint travelling together.
  5. When a witness works, the app keeps it instead of swapping, and the count of seams is reported as a health metric.
**Must carry**:
  - One limiter per host inside the host-owned fetch (429 pauses the host, 403 opens a breaker, jitter on schedules); a request budget for verification fetches.
  - Per-host cap through pg-boss `group` + `groupConcurrency`, not `singletonKey` (dedupe only; the milestone text says `singletonKey`, the Phase 1 spike decides).
  - Choose the solver by measuring FlareSolverr and Byparr on the 64 Cloudflare-blocked sources; a "fetch through the solver session" fallback for images. Do the Cloudflare work only if the pass rate says it pays.
**Research**: Needed. Cloudflare solver and `cf_clearance` identity (UA, IP, TLS); confirm pg-boss group concurrency in the pinned version.
**Plans**: TBD

### Phase 8: polish
**Goal**: The household can run Aizoban for real: extensions describe their own settings, the sandbox is hardened, users and API keys are managed in the UI, and the docs take a new operator from nothing to a running instance.
**Mode:** mvp
**Tracker:** [milestone 9](https://github.com/elfensky/aizoban/milestone/9)
**Depends on**: Phase 7
**Requirements**: POL-01, POL-02, POL-03, POL-04
**Success Criteria** (what must be TRUE):
  1. A user opens an extension's settings and sees a form rendered from the extension's own description, and saved values reach the extension.
  2. Extensions run under a separate uid or container behind the same RPC, and the Phase 1 hostile-extension test still passes under it.
  3. An admin creates and disables users and issues and revokes API keys in the UI; a revoked key stops working at once.
  4. A new operator follows the deployment and user docs on a clean machine and reaches a working instance.
**Must carry**:
  - A legal read on GPL-3.0 extensions loaded at runtime inside an AGPL host, and on the converted registry used in Phase 0, before any public release; a tested purge path; a README non-affiliation statement.
  - Notifications, scan pings, backup and Mihon follow import (XTRA-01 to XTRA-04) are v2, outside this roadmap. Research names this phase as their natural home if they are pulled in.
**Research**: Not needed. The licence question needs a legal read, not research.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (Phase 6 may run in parallel with 4 and 5 by owner choice)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. skeleton | 0/TBD | Not started | - |
| 2. recipes | 0/TBD | Not started | - |
| 3. library | 0/TBD | Not started | - |
| 4. census | 0/TBD | Not started | - |
| 5. assay | 0/TBD | Not started | - |
| 6. readers | 0/TBD | Not started | - |
| 7. scale | 0/TBD | Not started | - |
| 8. polish | 0/TBD | Not started | - |
