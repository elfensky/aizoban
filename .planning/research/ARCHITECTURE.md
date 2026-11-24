# Architecture Research

**Domain:** Self-hosted manga acquisition + library + metadata manager (no reader). Runs Paperback 0.9 extensions server-side, files verified CBZ + ComicInfo.xml, serves Komga API + OPDS-PSE.
**Researched:** 2026-11-02
**Confidence:** MEDIUM overall. The repo rules and Phase 0 numbers are HIGH (read from AGENTS.md, decision 0001, PROJECT.md). Component boundaries are an informed design inside those rules. Comparable-system patterns (Sonarr, Suwayomi, Komga) come mostly from training knowledge and are MEDIUM. Items marked LOW need a spike.

**eli14 summary.** Think of a post office with three rooms. The *mail room* (js-worker) fetches parcels from strangers. It never opens a parcel in the front office. The *back office* (ingest role) checks each parcel against other parcels, packs it in a standard box and shelves it. The *front desk* (web process) only reads the shelf list and hands boxes to customers. Today the risk is one wrong box on the shelf. The future risk is a stranger's parcel that tries to walk into the back office. The doors between rooms exist to stop that.

## Standard Architecture

### System Overview

Systems like this (Sonarr/Radarr for TV and film, Suwayomi and Kaizoku.NET for manga) share one shape: a *catalogue* (what should exist), *indexers/sources* (who testifies that it exists), a *download engine* (fetch with per-host politeness), an *import pipeline* (verify, rename, move into the library), and a *serving layer* (what readers see). Aizoban keeps this shape but replaces the catalogue's external authority (TVDB) with its own Census, because manga has none.

Recommended shape for Aizoban. Arrows show the direction data flows. One image, three roles, plus Postgres and a shared volume.

```
 READERS (Kavita, Komga clients, Paperback, Panels, Mihon)          USER (browser)
        │ Komga /api/v1, OPDS 1.2 + PSE                                  │ UI
        ▼                                                                ▼
┌─ web (Next.js) ───────────────────────────────────────────────────────────────┐
│ UI · Komga/OPDS route handlers · API-key → Viewer scope · producer of jobs    │
│ mounts: library:ro  staging:ro (manifests only)   DB: read/write app tables   │
└───────┬───────────────────────────────────────────────▲──────────────────────┘
        │ pg-boss send()                                 │ SQL reads
        ▼                                                │
┌─ Postgres ───────────────────────────────────────────────────────────────────┐
│ app tables: Work, Witness, WitnessChapter(observations), Slot, Fill, Page-    │
│ fingerprints, Source/Extension registry, ExtensionState, Users, Keys          │
│ pg-boss schema: queues, jobs, schedules                                       │
└───────▲──────────────────────────────▲──────────────────────────────────────┘
        │                              │
┌─ worker, role=acquire (js-worker) ─┐ ┌─ worker, role=ingest (same image) ─────────────┐
│ SourceBackend: PaperbackBackend    │ │ validate manifest → assay (hash, dims) →       │
│  ├ Broker (egress, rate limit,     │ │ verify vs other witnesses → build CBZ+        │
│  │  cookies, state, interceptors)  │ │ ComicInfo in staging → fsync → atomic rename   │
│  └ spawns ──► ext-runner child     │ │ into library → commit Fill                     │
│       (no DB, no FS, no network)   │ │ Census reconcile · import-from-mount · reaper  │
│ writes images + manifest.json      │ │ mounts: staging:rw library:rw import:ro        │
│ mounts: staging:rw ONLY            │ │ DB: yes                                        │
└───────────────┬────────────────────┘ └──────────────────────▲──────────────────────────┘
                │ images + manifest.json ───────────────────────┘ (via staging volume)
                ▼
   staging/ and library/ on ONE filesystem (rename(2) must not cross mounts)
        ▲ transport strategy (direct fetch │ solver cookies │ solver-proxied fetch)
        │
┌─ solver (later) ─┐  headless browser, Cloudflare challenge, identity (UA/IP/TLS) matching
└──────────────────┘
```

Important: the acquire role cannot see the library or the import mount. The web role cannot write the library. The extension child can touch nothing. These are enforced by volume mounts, not by convention.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **contracts** (package) | The only shared surface between processes: manifest schema, broker↔runner RPC protocol, error taxonomy, `SourceBackend` interface, job payload types. | zod schemas + inferred types; versioned (`manifestVersion`). No runtime logic. |
| **db** (package) | Drizzle schema + migrations. One owner of migrations. | drizzle-orm, `drizzle-kit`; a compose `migrate` one-shot, not "whoever starts first". |
| **domain** (package) | Pure functions: Census reconcile, chapter-label parsing, page alignment (mutual nearest neighbour + template exclusion), path naming, ComicInfo mapping. No I/O. | Plain TS, tested against Phase 0 fixtures (`probes/phase-0/fixtures/chapters/` is committed). |
| **web** | UI, Komga/OPDS handlers, auth, job production, read-only views of Postgres + manifests. | Next.js route handlers. |
| **worker/acquire** | Run a source backend: search, details, chapters, pages, image fetch into staging. Owns egress policy per host. | Node 26 process; pg-boss consumers. |
| **Broker** (inside acquire) | The trusted half of the Paperback host. Performs every HTTP request on behalf of the extension, applies the extension's request/response interceptors, per-host rate limit, cookie jar, persists extension state. | In-process module in js-worker; talks to runner over IPC. |
| **ext-runner** | The untrusted half. Loads one extension bundle, exposes `search/details/chapters/pages` over RPC. Holds no secrets. | `child_process.fork` per extension (Phase 1), container/uid isolation (Phase 8). |
| **worker/ingest** | Trusted post-processing: validate, assay, verify, package, land, Census, import, reconcile. Only role with library write. | Same image as acquire, different command + mounts. |
| **Registry client** | List/install/update/pin extensions from a user-supplied repo URL, with provenance (URL + commit hash) recorded. Never bundles anything. | Fetch `versioning.json` + bundle; store bundle in a data dir, hash it, record row. |
| **Solver** (later) | Cloudflare challenge handling; returns cookies + identity, or proxies the fetch. | Separate container with a headless browser. |
| **Metadata** (later) | Canonical series metadata (titles, covers, genres, ratings) feeding ComicInfo and the Komga API. | Provider adapters (MangaDex, AniList, MangaUpdates). Not in the current phase list; decide placement in Phase 3. |

## Recommended Project Structure

npm workspaces monorepo. Match the Next.js conventions inside `apps/web`.

```
apps/
├── web/                      # Next.js: app/ (UI), app/api/v1/ (Komga), app/opds/ (OPDS), middleware
└── worker/                   # entrypoint: `node worker.js --role=acquire|ingest`; registers pg-boss handlers per role
packages/
├── contracts/                # zod: manifest, rpc, errors, jobs, SourceBackend interface
├── db/                       # drizzle schema, migrations, typed query modules, Viewer-scoped repos
├── domain/                   # census/, assay/ (align, phash compare), naming/, comicinfo/  (pure)
├── host/                     # PaperbackBackend: broker/, runner/ (child entry), polyfills/ (patched), registry/
├── library-io/               # staging writer, manifest reader, cbz builder, atomic land, reaper
└── recipes/                  # (Phase 2) YAML schema + template engines; also a SourceBackend
docker/                       # one Dockerfile (Node 26), compose.yaml with per-role mounts
probes/phase-0/               # untouched; fixtures feed domain tests
```

### Structure Rationale

- **contracts/ and domain/ have no I/O and no framework imports.** Both web and worker import them, and the Phase 0 numbers (threshold 14, mutual-NN, template exclusion) become unit tests rather than folklore.
- **host/ separates broker from runner at the directory level.** The runner entry may import only `contracts`. A lint rule (import boundary) enforces this, so a DB client cannot leak into the untrusted half.
- **library-io/ is the only code that touches `rename`.** One place to get atomicity, fsync and EXDEV handling right.
- **One image, role flag.** Decision 0001 says workers are `js-worker` (+ `solver`) and nothing else. A role flag keeps that true while still giving the ingest role different mounts. See Open Question 1.

## Architectural Patterns

### Pattern 1: Broker owns the network; the sandbox gets none

**What:** The extension child process makes no sockets. Every `Application.scheduleRequest` becomes an RPC to the broker. The broker runs the extension's `interceptRequest` / `interceptResponse` (by calling back into the runner), applies SSRF rules (no RFC1918/loopback/link-local targets, no redirects into them), the per-host limiter, the cookie jar and the transport strategy (direct / solver cookies / solver proxy).
**When to use:** Always. It makes "no network, no FS, no DB" achievable in the child and puts rate limiting, Cloudflare handling and egress logging in exactly one place.
**Trade-offs:** More RPC chatter (fine for HTML-sized payloads). Image downloads go through the broker, not the runner. Open risk: sources whose interceptors rewrite image bytes. Detect by feature flag `needsResponseBody` and treat as a Phase 2+ item (LOW confidence this exists in the 0.9 corpus; the sweep had no missing-ABI failures, so it is not common).

```typescript
// packages/contracts/src/rpc.ts — the whole surface the untrusted half sees
type RunnerRequest =
  | { op: 'search'; query: string; page?: unknown }
  | { op: 'details'; mangaId: string }
  | { op: 'chapters'; mangaId: string }
  | { op: 'pages'; mangaId: string; chapterId: string }
  | { op: 'interceptRequest'; request: HttpRequest }      // broker → runner
type RunnerCallback =                                       // runner → broker
  | { op: 'http'; request: HttpRequest }
  | { op: 'stateGet' | 'stateSet'; key: string; value?: unknown }
  | { op: 'log'; level: string; msg: string }
```

### Pattern 2: Staging manifest as the only worker→app interface

**What:** The acquire role writes `staging/<jobId>/pages/NNN.<ext>` and then writes `manifest.json` last, via write-to-`manifest.json.tmp` then `rename`. A manifest is present only when the chapter is complete. The ingest role treats a staging dir with no manifest as garbage after a TTL.
**When to use:** Every chapter acquisition.
**Trade-offs:** A second hop (ingest) adds latency and a job. It buys crash safety and keeps pixels out of the web role.

```json
{
  "manifestVersion": 1,
  "jobId": "…", "work": "…uuid", "witness": "…uuid",
  "extension": { "package": "…", "className": "…", "version": "…", "repoUrl": "…", "commit": "…", "bundleSha256": "…" },
  "chapter": { "sourceChapterId": "…", "rawLabel": "Vol.3 Ch.21", "rawVolume": "3", "parsedNumber": 21, "parsedVolume": 3, "title": "…", "lang": "en", "publishedAt": "…" },
  "pages": [ { "index": 0, "file": "pages/000.jpg", "bytes": 123456, "sha256": "…", "sourceUrl": "…" } ],
  "fetch": { "startedAt": "…", "finishedAt": "…", "errors": [] }
}
```

Keep `rawLabel` verbatim and store parsed fields beside it. Never overwrite one with the other.

### Pattern 3: Intent-logged landing (stage, record, rename, confirm)

**What:** The ingest role builds `Series/.Series c012.cbz.part` inside `library/` (same filesystem as staging), fsyncs the file and its directory, then (1) writes `Fill(state=landing, targetPath)`, (2) `rename`s to the final name, (3) sets `Fill(state=landed)`. A reaper on startup reconciles: `landing` row + file present → mark landed; `landing` row + no file → retry or fail; file with no row → report, never delete silently.
**When to use:** Every write into the library, including import.
**Trade-offs:** Three states instead of one. It is the only way to survive a crash between rename and commit without a false "done". This also makes "never report import done while anything is unresolved" a query: `count(*) where state != 'landed'`.

### Pattern 4: Observations are append-only; Slots are derived

**What:** Witnesses never write chapters into the canonical list. Each refresh appends `WitnessChapter` observations (raw label, parsed number, observed_at, source ids). The Census is a pure, versioned function `reconcile(observations, overrides) → slot assignments + evidence`. Manual overrides are an input table, never an edit to derived rows.
**When to use:** From Phase 1 (store observations), activate the Census in its own phase.
**Trade-offs:** Re-running Census recomputes slots. Slot identity must therefore be stable across runs (Slot id minted once, then matched), or file paths and Komga book ids churn. Design Slot-id stability before Phase 4 (see Pitfalls in this file).

### Pattern 5: Per-host queues, not per-extension queues

**What:** Concurrency and politeness belong to the *host* (domain), not the extension: many extensions share one CDN, and one extension can span several hosts. Key limiter state on the registrable domain. In pg-boss v12 the available primitives are queue policies (`standard`, `singleton`, `stately`, others) with `singletonKey`, plus retry with exponential backoff and heartbeat expiry (12.38.0 batch-fails expired jobs). A `singleton`/`stately` queue *without* a `singletonKey` allows one active job for the whole queue, and a rejected enqueue returns `null` instead of throwing (third-party report, verify). Two workable designs: (a) one queue per host created at extension install, `localConcurrency: 1..n`; (b) one `acquire` queue with `singletonKey = host`.
**Recommendation:** Start with (a) for `fetch-chapter` jobs, because it gives per-host concurrency and backoff without relying on policy edge cases, and keeps "queue per site" (Phase 7) a config change rather than a rewrite. Run a half-day spike in Phase 1 to confirm (b) does not already satisfy it with the pinned pg-boss version. Confidence: MEDIUM (docs pages fetched did not document `singletonKey` or group concurrency; only release notes confirm `singletonKey` on singleton/stately queues).
**Trade-offs:** (a) means dynamic `createQueue` and a worker registration per host; (b) is one worker but leans on policy semantics that had bugs in 12.37.x.

### Pattern 6: Typed error taxonomy as the retry contract

**What:** Reuse the Phase 0 classes (`CLOUDFLARE_CHALLENGE`, `EMPTY_SEARCH`, `EXTENSION_CRASH`, `EMPTY_CHAPTERS`, `NETWORK`, `PARSER_CHANGED`, `TIMEOUT`) as a closed enum in `contracts`. Each class maps to a policy: retry with backoff, needs solver, mark source degraded, or fail permanently. Handlers return typed results; they throw only for bugs.
**When to use:** From Phase 1; the retry policy table is what Phase 7 tunes.
**Trade-offs:** Needs discipline: an `unknown` class must alert, not retry forever.

### Pattern 7: Viewer-scoped repositories for the Komga projection

**What:** Every read function that serves a reader takes a `Viewer` (user, allowed libraries, content-rating ceiling) as a mandatory argument. There is no unscoped variant exported to `web`. The same Works and Fills back every user. Komga ids are the Work id (series) and the Fill id (book), minted once.
**When to use:** All Komga/OPDS handlers. Content-rating filtering is in the schema from Phase 1 (per PROJECT.md).
**Trade-offs:** A bit of ceremony; it removes a whole class of cross-user leaks.

## Data Flow

### Request Flow (reader)

```
Reader ─► /api/v1/series (GET or POST /series/list) ─► auth: X-API-Key | Basic ─► Viewer
   ▲                                                              │
   │ JSON (Komga DTO)                                    Viewer-scoped repo ─► Postgres
   └───────────────────────────────────────────────────────────────┘
Reader ─► /api/v1/books/{id}/pages/{n} ─► resolve Fill → path in library:ro ─► stream one zip entry
```

### State Management

Postgres is the single source of truth. pg-boss holds job state in the same database. The filesystem is a projection that the reaper reconciles against Postgres. The web role holds no in-memory domain state.

### Key Data Flows

1. **Discovery.** User or schedule → `refresh-witness` job (acquire) → runner `details` + `chapters` → append `WitnessChapter` observations (raw + parsed). Gives the Census its testimony.
2. **Census.** `reconcile-work` job (ingest) → pure `domain/census` over observations + overrides → Slot assignments with evidence + "missing slot" detection → enqueue `fetch-chapter` for unfilled slots, choosing the best witness.
3. **Acquisition.** `fetch-chapter` (per-host queue) → runner `pages` → broker fetches each image → staging pages → manifest last → enqueue `ingest-chapter`.
4. **Ingest + verify.** `ingest-chapter` → validate manifest (schema, file sizes, sha256) → assay (dimensions, JPEG quality, pHash per page) → if a second witness exists, compare content-aligned against its fingerprints (fetch that witness's pages for fingerprints only, then discard bytes) → agree: build CBZ + ComicInfo and land (Pattern 3); disagree: quarantine (Fill `quarantined`, files stay in staging quarantine, not in library). Single witness: land flagged `single_witness`, re-verified when a second witness appears.
5. **Import.** `import-scan` (ingest) reads the read-only mount, copies into staging, then follows flow 4. Import status = count of unresolved rows; nothing says "done" while that is non-zero.
6. **Serving.** Reader → web → Postgres (metadata) and library:ro (bytes). Thumbnails and covers are generated at ingest time and stored as files, so web does no pixel work.

## Scaling Considerations

Single household, single tenant. Scale means library size and source count, not users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1–3 users, ≤ 2k chapters | One compose stack, one acquire and one ingest container, Postgres small. Defaults are fine. |
| 5–10 users, ~50k chapters | Index Fill/Slot on (work, sort key); paginate Komga lists with keyset pagination; precompute counts. Add a second ingest replica only if assay CPU is the bottleneck. |
| Large library, many sources | Per-host queues tuned (Phase 7); fingerprint storage grows (64-bit hash × pages × witnesses, small); verification bandwidth dominates. |

### Scaling Priorities

1. **First bottleneck: verification bandwidth, not CPU.** Verifying a chapter means downloading it from a second witness. Mitigate: store fingerprints and discard bytes; verify at ingest of the first copy, not on every refresh; respect per-host limits.
2. **Second bottleneck: Cloudflare-gated hosts.** 64 of 196 Phase 0 failures. The solver and identity matching decide how many sources are usable at all.

## Anti-Patterns

### Anti-Pattern 1: "Chapters belong to a source"

**What people do:** Add a `chapters` table with a `source_id` and number column; treat the first source as the list.
**Why it's wrong:** Drift is 10.4% across 10 works × up to 10 sources; renumbering is invisible to number matching. The product's reason to exist disappears.
**Do this instead:** Observations (per witness) → Slots (derived) → Fills (files). Never a foreign key from a library chapter to a source's numbering.

### Anti-Pattern 2: `node:vm` or `--permission` as the sandbox

**What people do:** Keep the Phase 0 `host.mjs` pattern in the product, or add `node --permission` and call it sandboxed.
**Why it's wrong:** The Node docs call the permission model a "seat belt" that gives no guarantees against malicious code. It follows symlinks, existing file descriptors bypass it, and `process._debugProcess()` is not gated. `isolated-vm` is stronger but is in-process and had a critical memory-corruption escape disclosed in 2026 (fixed in 7.0.1/6.2.0).
**Do this instead:** Phase 1: child process with empty `env`, no network (broker owns egress), `--permission` as extra hygiene, hard timeouts and memory caps, kill on stall. Phase 8: a different uid or container with no volumes and no secrets. Design the RPC now so hardening changes only how the child is spawned.

### Anti-Pattern 3: Rename across filesystems

**What people do:** Put staging on a tmpfs or a separate Docker volume from the library.
**Why it's wrong:** `rename(2)` across mounts fails with `EXDEV`; a copy-then-delete fallback is not atomic, and Kavita/Komga rescans see half-written files.
**Do this instead:** Staging and library are sibling directories on one volume. The ingest role asserts same-device (`stat.dev`) at startup and refuses to start otherwise.

### Anti-Pattern 4: Trusting parsed numbers or page indexes

**What people do:** Match chapters by `chapNum`; compare page N to page N.
**Why it's wrong:** Converted MangaFox returns the volume as `chapNum`; sources insert covers and ads at different positions.
**Do this instead:** Keep raw labels; compare pages by mutual nearest neighbour with template pages excluded and a page-count guard for stitched webtoons (threshold ≈ 14 bits on 64-bit pHash).

### Anti-Pattern 5: YAML recipes that grow selectors

**What people do:** Let YAML define CSS selectors, then conditionals, then a language.
**Why it's wrong:** Projects that did this died (AGENTS.md hard rule).
**Do this instead:** A recipe names a template (Madara, MangaThemesia) and supplies identity and capability data. Anything else is code, as an extension. The code escape hatch is first-class so nobody extends the YAML.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Extension registries (inkdex, nicartjay PaperbackExt) | Registry client fetches `versioning.json` and `<source>/index.js` at user request | Record repo URL + commit + bundle sha256. Key sources on (package, className), never numeric ids. Never ship a default registry list in the image. |
| Manga source sites | Broker only | Per-host limits; User-Agent and cookie identity must match the solver's when the solver is used. |
| Cloudflare | Solver (later) | Cookies are tied to IP + UA (+ TLS fingerprint); route the post-solve requests through the same identity. |
| Reader apps | Komga `/api/v1` (X-API-Key or Basic; session cookies for logged-in clients), OPDS 1.2 at `/opds/v1.2/catalog`, PSE 1.2 (`pse:count`, `{pageNumber}`, `{maxWidth}` template) | Komga API shape and OPDS endpoint path confirmed from komga.org; exact endpoint inventory and PSE link output must be checked against a live Komga in Phase 6 (LOW). |
| Metadata providers (later) | Adapter per provider, results cached in Postgres | Treat provider data as testimony too; keep provenance per field. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| web → worker | pg-boss `send()` with typed payloads from `contracts` | Web is a producer only. Do not run pg-boss maintenance/schedules from web (confirm option names for v12). |
| acquire → ingest | Staging volume + manifest, then `ingest-chapter` job | The manifest is the contract. The job carries only the `jobId`, never paths built by the worker. |
| broker ↔ ext-runner | JSON-RPC over the child's IPC channel (later: unix socket) | Message size caps, per-call timeout, one in-flight limit per runner. |
| ext-runner ↔ anything else | None | No env, no FS beyond its bundle, no network. |
| ingest → library | `library-io` only | Single module owns fsync + rename + intent log. |
| web → library | Read-only mount | Enforced by `:ro`. |
| Census ↔ Assay | `Slot.evidence` JSON + fingerprint table | Census v1 aligns by label and number with a confidence; Assay upgrades or downgrades it. |

## Suggested Build Order

Dependencies, not calendar. Phase numbers follow the tracker milestones.

```
contracts ──┬─► db+queue skeleton (#5) ──┬─► host/broker/runner + registry (#6) ──┐
            │                            └─► library-io + ingest minimal  (#7) ───┤
            └────────────────────────────────────────────────────────────────────┴─► compose e2e + Kavita smoke (#8)

Phase 1 ─► Phase 2 Recipes  (needs only SourceBackend interface)
Phase 1 ─► Phase 3 Library  (full Work/Witness/Slot/Fill + import)
Phase 3 ─► Phase 4 Census   (needs observations + Slots; uses domain fixtures)
Phase 3 ─► Phase 5 Assay    (needs Fills + staging pages; feeds Census evidence)
Phase 3 ─► Phase 6 Readers  (needs only Work + Fill; can run parallel to 4/5)
Phase 1,4,5 ─► Phase 7 Scale ─► Phase 8 Polish (real sandbox)
```

1. **Phase 1, first: `contracts`.** Manifest schema, RPC, error taxonomy and `SourceBackend` interface must be fixed before #6 and #7 start, because they are built in parallel against it. Write them as the first part of #5.
2. **Phase 1, schema: more than the issues say.** Create Work, Witness, WitnessChapter (raw label + parsed + observed_at), Slot and Fill now, with a degenerate policy (one Slot per witness chapter, one Fill per Slot). Phases 3 and 4 then change the *arbitration*, not the *shape*. Putting a `source_id` on a library chapter in Phase 1 is the rewrite trap.
3. **Phase 1, `ext-runner` boundary from day one**, even though hardening is Phase 8. Retrofitting an RPC boundary into a `vm`-in-process host touches every polyfill.
4. **Phase 1, per-host queues and `Viewer`-scoped repos from day one.** Both are named in PROJECT.md; both are expensive to retrofit.
5. **Phase 2 (Recipes)** needs only the `SourceBackend` interface and can start any time after Phase 1; it does not need Census.
6. **Phase 3 (Library) before Census.** Import must exercise the Pattern 3 landing path and the "unresolved" count before anything claims done.
7. **Phase 4 and Phase 5 are coupled.** Chapter identity for renumbered witnesses needs content verification. Ship Census v1 as label-and-number alignment that emits `confidence` and `evidence`, with an `unverified_alignment` state, then let Assay resolve it. Put the pure aligned-compare function in `domain/` in Phase 4 so Assay in Phase 5 only adds fetching, storage and quarantine.
8. **Phase 6 (Readers)** may move earlier or run parallel to 4/5 if household value matters more than ordering; its only dependency is stable Work and Fill ids.
9. **Phase 8** replaces the child-process boundary with a uid/container boundary behind the same RPC.

## Open Questions (need an owner decision before the phase that hits them)

1. **Who builds the CBZ?** Issue #7 says "the app validates the manifest, builds CBZ + ComicInfo.xml". Building a CBZ reads every page byte, so if "app" means the Next.js web process it breaks the hard rule. Recommendation: the ingest role (same image as js-worker, different mounts) does this. It is a clarification of "app", not a new container kind, but decision 0001 says "nothing else" next to `js-worker`, so record a short ADR. Decide before Phase 1 issue #7.
2. **Serving bytes.** Komga `/books/{id}/pages/{n}`, `/file` and OPDS-PSE streams must deliver image bytes, and the web process is the natural server. The hard rule, read literally, forbids it. Recommendation: read the rule as "no *unverified acquisition* bytes in web". Web may stream *landed* library files from a read-only mount, with thumbnails pre-generated at ingest and `maxWidth` resizing deferred or cached. If the rule is literal, a fourth role (`media`) is needed. Decide before Phase 6.
3. **Slot id stability** across Census re-runs. Needs a matching rule (Slot keeps id if its best-evidence member persists) and a policy for renaming files when a Slot's number changes (rename is an atomic job; Fill id and Komga book id never change). Decide at Phase 4 design.
4. **pg-boss per-host design** (queue per host vs `singletonKey`). Spike in Phase 1.
5. **Metadata component placement.** The project is called a metadata manager but no phase lists a metadata provider layer. Place it in Phase 3 or add a phase.

## Pitfalls specific to this architecture

- **Crash between rename and DB commit** produces a library file with no Fill row; Kavita ingests it and the DB disagrees. Pattern 3 plus the reaper.
- **Parent `environ` readable by the child on Linux.** An empty `env` on spawn is not enough against malicious code (same uid can read `/proc/<ppid>/environ`). Treat the Phase 1 boundary as hygiene; do not give the acquire role DB credentials beyond what its queue needs, and plan a different uid for the child in Phase 8.
- **Migrations racing.** Web, acquire and ingest all start together. Run migrations in one compose one-shot; let pg-boss's own schema setup happen from the worker only.
- **Compose volume layout.** One named volume holds `/data/{staging,library}`; the import is a separate read-only bind. A second volume for staging silently breaks atomic rename.
- **Per-user libraries as directories** are forbidden; `Viewer` scoping covers it. Resist adding a `library_id` that maps to a directory.
- **Re-verification storms.** Each new witness could re-trigger verification of every single-witness Fill. Rate-limit by Work and batch.

## Sources

- `/Users/andrei/Developer/.worktrees/aizoban/night-gsd-standard/AGENTS.md`, `.planning/PROJECT.md`, `docs/decisions/0001-acquisition-make-or-buy.md`, `.planning/codebase/ARCHITECTURE.md` — repo rules and Phase 0 numbers (HIGH).
- [Node.js permissions documentation](https://nodejs.org/api/permissions.html) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4347) — "seat belt" wording, symlink, file descriptor and `_debugProcess` gaps, `--allow-net`, `--allow-child-process` (HIGH; vendor docs).
- [isolated-vm sandbox-escape coverage (CSO Online)](https://www.csoonline.com/article/4212151) and [DevOps.com](https://devops.com/critical-flaw-in-isolated-vm-can-lead-to-sandbox-escape-rce-threat/) — 2026 ExternalCopy flaw, fixed in 7.0.1/6.2.0 (MEDIUM; secondary).
- [pg-boss](https://github.com/timgit/pg-boss) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4343), [pgboss.io](https://pgboss.io/) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4350) (version 12.38.0, Node ≥ 22.12, Postgres ≥ 13, queue storage policies), [releases](https://github.com/timgit/pg-boss/releases) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4359) (`singletonKey` on singleton/stately queues, stately fetch bug in 12.37.x, heartbeat batch-fail in 12.38.0). Group concurrency and exact option names not confirmed (MEDIUM/LOW).
- [Basedash: what we learned running background jobs on postgres](https://www.basedash.com/blog/what-we-learned-running-background-jobs-on-postgres) — singleton/stately without a key limit the whole queue; rejected enqueue returns null (LOW; third-party).
- [Komga API](https://komga.org/docs/openapi/komga-api/) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4346) — `X-API-Key`, Basic auth, session cookie behaviour (HIGH for auth; endpoint inventory not read).
- [OPDS-PSE 1.2](https://github.com/anansi-project/opds-pse/blob/master/v1.2.md), [Komga OPDS guide](https://komga.org/docs/guides/opds) — stream link, `pse:count`, `{pageNumber}`, `{maxWidth}`; Komga catalogue at `/opds/v1.2/catalog` (MEDIUM).
- Sonarr/Radarr, Suwayomi, Kaizoku.NET comparisons — training knowledge, not re-verified this session; a search for Kaizoku.NET architecture returned nothing usable (LOW/MEDIUM).

---
*Architecture research for: self-hosted manga acquisition + library manager*
*Researched: 2026-11-02*
