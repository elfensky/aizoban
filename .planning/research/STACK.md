# Technology Stack

**Project:** Aizoban
**Researched:** 2026-11-02
**Mode:** Ecosystem, inside the decided frame (Next.js + TypeScript + Postgres/drizzle + pg-boss; workers `js-worker` + `solver`; Node 26)
**Overall confidence:** MEDIUM-HIGH. Versions come from the npm registry on 2026-11-02. Library behaviour comes from the official docs. Four items need a Phase 1 spike (marked **SPIKE**).

## Decisions that differ from what the repo implies

| Topic | Recommendation | Why it matters |
|-------|----------------|----------------|
| TypeScript | **6.0.3**, not 7.0.2 | TS 7 is the native (Go) compiler. It does not expose the JS compiler API that `next build` loads. A DocumentDB PR reports `next build` fails on 7.0.2, and Next 15.5 now rejects TS >= 7 with an error. `typescript-eslint` also caps at `<6.1.0`. |
| `@paperback/*` version | Stay on **1.0.0-alpha.64** exactly. Do not take `alpha.92`. | `alpha.92` (2026-06-14) removes `MockSearchFilterManager` and rewrites `base64Encode`/`base64Decode`. That is a different API generation than the Paperback 0.9 corpus measured in Phase 0. Both known bugs are still present in `alpha.92`. |
| Polyfills | **Vendor** the ~250 lines of `runtime-polyfills` into the repo. Keep `@paperback/types` as a type-only dev dependency. | The host must replace `scheduleRequest` (no network in the sandbox child) and must persist `getState`/`setState` to Postgres. Both are in-memory in the package. After those replacements the interceptor bug disappears by construction. Upstream the one-line fix as a courtesy. |
| Per-host job limits | Use pg-boss 12 `group` + `groupConcurrency` for the per-host cap. Keep `singletonKey` for idempotency. | PROJECT.md says "singletonKey on source domain". `singletonKey` gives one job per key, not a configurable per-host cap. Group concurrency is the native primitive and is enforced in the database across nodes. |
| Worker runtime | Run `js-worker` as **native TypeScript** on Node 26 (type stripping). No `tsx`, no build step. | Type stripping is stable since Node 25.2. Needs `erasableSyntaxOnly`, `.ts` import extensions and `import type`. |
| Drizzle | **0.45.4** (the `latest` tag), SQL-like builder only. Avoid `db.query.*` relational queries. | v1 is at `1.0.0-rc.5` (2026-10-21). The SQL-like builder is unchanged between 0.45 and v1. Relational queries and the migrations folder format change. Avoiding `db.query` makes the later move a `drizzle-kit up`. |

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | 26.13.0 (LTS "Lithium"; Docker `node:26-slim`) | Runtime for web, `js-worker`, `solver` client, CI | Newest LTS, per Andrei's runtime rule. Permission model (`--permission`) and native type stripping are both stable in 26. | HIGH |
| TypeScript | 6.0.3 | Type checking only (`noEmit`) | Last JS-based compiler. Required by Next 16 today. Revisit TS 7 when Next documents support (`experimental.useTypeScriptCli`, still tracked in vercel/next.js#95633). | HIGH |
| `@types/node` | 26.6.6 | Node types | Matches runtime. | HIGH |
| Next.js | 16.4.4 | Web UI, Komga `/api/v1` and OPDS route handlers | Decided. Turbopack default. `output: 'standalone'` for the Docker image. Peer: React `^19`. | HIGH |
| React / React DOM | 19.3.1 | UI | Next 16 peer. | HIGH |
| npm workspaces | npm 11.20 (bundled with Node 26.12) | Monorepo: `apps/web`, `apps/js-worker`, `packages/core` (schema, manifest zod, ComicInfo, error taxonomy) | Repo already uses npm and `npm ci` (AGENTS.md). A shared `core` package keeps the staging manifest contract in one place. | HIGH |

### Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PostgreSQL | 18.6 (`postgres:18` image) | App data and the pg-boss queue | 18 is the newest GA line (support to 2030-11). 19 is at RC1 on 2026-10-15, not GA. pg-boss needs PG 13+. | HIGH |
| `drizzle-orm` | 0.45.4 | Schema, typed SQL builder | Decided. Copy the setup from descent-app. | HIGH |
| `drizzle-kit` | 0.31.11 | Migrations (`generate`, `migrate`) | Pair with 0.45. | HIGH |
| `pg` | 8.23.1 | Postgres driver | pg-boss depends on `pg ^8.23.1`. One driver for app and queue. Drizzle supports `drizzle-orm/node-postgres`. Do not add `postgres` (porsager). | HIGH |
| `@types/pg` | 8.23.1 | Types | Drizzle peer. | MEDIUM |
| `pg-boss` | 12.38.0, exact pin, never below 12.37.1 | Job queue, cron, per-host concurrency | Decided. 12.37.1 fixes `singleton`/`stately` queues stalling after completion. The line ships weekly, so pin exactly and bump deliberately. Needs Node >= 22.12, PG >= 13. | HIGH (library) / MEDIUM (group concurrency, docs are thin) |

pg-boss shape for Phase 1 (from the official API docs):

- **Web process (producer):** `new PgBoss({ connectionString, supervise: false, schedule: false, migrate: false, registerInstance: false })`. It only calls `send()`. Confirm these flags in the spike.
- **`js-worker` (consumer, owns migrations and supervision):** one `PgBoss` instance with defaults. Run `createQueue()` at boot, idempotently.
- **Queues:** `search`, `details`, `chapters`, `download`, `finalize`. Set `retryLimit`, `retryBackoff: true`, `retryDelayMax`, `heartbeatSeconds: 30` on download queues, and `deadLetter` per queue. Set `expireInSeconds` above the longest chapter download.
- **Per-host cap:** `send(queue, data, { group: { id: host } })` plus `work(queue, { groupConcurrency: { default: 2, tiers: {...} } })`. Use `singletonKey` as `${chapterId}` for dedupe. **SPIKE:** prove a cap of 1 per host holds across two worker processes.
- **Error taxonomy as protocol:** throw typed errors. Map class to retry behaviour in the handler: `CLOUDFLARE_CHALLENGE`, `NETWORK`, `TIMEOUT`, `PARSER_CHANGED`, `EMPTY_*` (the Phase 0 classes in `probes/phase-0/host.mjs`). pg-boss retries on throw. For "do not retry", complete the job with a failure result or use `deadLetter`. Decide this in the Phase 1 plan.

### Paperback 0.9 host (js-worker)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@paperback/types` | 1.0.0-alpha.64 (exact, dev, type-only) | Types for `Source`, `Chapter`, `SourceManga`, etc. | Matches the corpus that passed 222/418. Pull types only. Never runs at runtime. | HIGH |
| `@paperback/runtime-polyfills` | 1.0.0-alpha.64 (MIT), **vendored** into `apps/js-worker/src/polyfills/` | `Application` mock: `decodeHTMLEntities`, base64, state, selector registry, discover sections, search filters | Copy with attribution. Replace `scheduleRequest` with an RPC to the parent. Replace state with RPC to Postgres. Fix the interceptor chain (`requestInterceptor(finalRequest)`). Add `formDidChange` and a form manager (reference: `r52/gagaku` extension host, MIT). Needs `entities ^7` and `user-agents ^1`. | HIGH |
| `entities` | ^7.0.0 | HTML entity decode | Dependency of the vendored polyfill. Keep to the alpha.64 range. | HIGH |
| `user-agents` | ^1.1.669 | Default UA for `getDefaultUserAgent` | Same. Prefer a fixed, solver-matching UA once the solver lands. | MEDIUM |

Findings that shape the host:

- The polyfill is a **test mock**. Its `scheduleRequest` calls global `fetch` directly. Its state lives in a closure object. A product host must own both. This is the reason to vendor.
- Extension bundles are single-file JS that define a `source` global. The probes load them with `vm.runInContext` and read `source[sourceId]`.
- Source identity key: `(extension package, class name)`, never a numeric id (PROJECT.md constraint).

### Sandbox: process per extension (Node permission model)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `node:child_process` `fork()` | Node 26 | One child per extension (pooled and idle-reaped) | The process boundary the hard rule asks for. Kill on timeout. Cap with `--max-old-space-size`. | HIGH |
| `node --permission` | Node 26.13 (stable) | Deny fs, net, child process, worker, addons, WASI in the child | Zero grants. The child gets no filesystem and no network. Denied operations throw `ERR_ACCESS_DENIED`. | HIGH (flags), MEDIUM (effectiveness) |
| IPC `process.send` / `message` | Node 26 | Child to parent RPC: HTTP request, state get/set, logging | The parent does the HTTP. This gives per-host rate limiting, cookie jar, solver cookie injection and size limits in one trusted place. **SPIKE:** confirm IPC works under `--permission` with no grants. | MEDIUM |
| `node:vm` | Node 26 | Global-scope construction inside the child only | Not a boundary. It only shapes which globals the bundle sees. The process and permission flags are the boundary. | HIGH |

Hardening rules (apply from Phase 1, tighten in Phase 8):

1. The Node docs say the permission model is a "seat belt" for trusted code, not a security boundary. Treat it as one layer. Add the others below.
2. `--allow-net` is all-or-nothing. There is no per-host allow-list. Do **not** grant it. Proxy all HTTP through the parent.
3. Spawn the child with an empty `env`. The parent holds the DB URL. The child never gets it.
4. Run children under a separate uid/gid (`fork` `uid`/`gid` options). Reason: `process._debugProcess(pid)` is not gated by the permission model, so a same-user child can open the parent's inspector.
5. Container layer: `js-worker` container has a read-only root filesystem, a writable `staging` volume only, no capabilities, and no mount of the library or import volumes.
6. Do not grant symlink-following paths. Node follows symlinks even outside granted paths. Grant nothing, so this does not apply.

### Staging, CBZ and ComicInfo

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| `yazl` | 3.3.1 (+ `@types/yazl` 3.3.1) | Write CBZ | Streaming zip writer. One small dependency (`buffer-crc32`). Use `compress: false` (store) for JPEG/PNG/WebP pages, which are already compressed. Write to `*.cbz.tmp` in staging, `fsync`, then `rename`. | HIGH |
| `yauzl` | 3.4.0 (+ `@types/yauzl` 3.4.0) | Read CBZ (import, page serve for PSE, assay) | Random-access, lazy entry reads. Use for reading `ComicInfo.xml`, counting pages and extracting one page. | MEDIUM |
| `fast-xml-parser` | 5.11.2 | Build and parse `ComicInfo.xml` | One dependency for both directions (build on download, parse on import). `XMLBuilder` keeps object key order, so write keys in XSD order. | HIGH |
| `zod` | 4.6.7 | Validate `manifest.json`, registry listings, YAML recipes, env | One schema is both the type and the validator at every trust boundary. | HIGH |
| `sharp` | 0.35.5 | Probe dimensions and format, decode for hashing, optional PSE resize | Phase 0 used 0.35.3. Needs Node >= 20.9. Use glibc images (`node:26-slim`). Prebuilt binaries ship as optional packages. | HIGH |
| In-house pHash | n/a (about 40 lines, from `probes/phase-0/phash.mjs`) | Perceptual fingerprint | Keep the validated algorithm: 32x32 grayscale, DCT-II, top-left 8x8, drop DC, threshold at the median, 63 bits. The threshold of 14 was validated on **this** algorithm. Store `algo_version` beside each hash. Precompute the cosine table. Do not swap in a library. | HIGH |

ComicInfo.xml rules (schema: `anansi-project/comicinfo` draft v2.1):

- The schema is an `xs:sequence`. Elements must appear in this order: `Title, Series, Number, Count, Volume, AlternateSeries, AlternateNumber, AlternateCount, Summary, Notes, Year, Month, Day, Writer, Penciller, Inker, Colorist, Letterer, CoverArtist, Editor, Translator, Publisher, Imprint, Genre, Tags, Web, PageCount, LanguageISO, Format, BlackAndWhite, Manga, Characters, Teams, Locations, ScanInformation, StoryArc, StoryArcNumber, SeriesGroup, AgeRating, Pages, CommunityRating, MainCharacterOrTeam, Review, GTIN`. Write a unit test that asserts the order.
- `Number` is a string (keeps `10.5`, `Extra`). `Count`, `Volume`, `Year`, `Month`, `Day`, `PageCount` are ints.
- `Manga` enum: `Unknown | No | Yes | YesAndRightToLeft`. Use `YesAndRightToLeft` for manga.
- `AgeRating` enum is fixed (`Everyone`, `Teen`, `Mature 17+`, `Adults Only 18+`, `X18+`, ...). Map the content rating once, in the schema layer.
- Kavita reads: `Series`/`SeriesSort`, `LocalizedSeries`, `Title`, `Number`, `Volume`, `Count`, `Year/Month/Day`, `Summary`, `Publisher`, `Genre`, `Tags`, `Web`, `LanguageISO`, `PageCount`, `Writer`... `Translator`, `Format`, `SeriesGroup`, `StoryArc`, `AgeRating`. The file must be named exactly `ComicInfo.xml` at the archive root. Kavita's page does not list `Manga`. Komga reads it. Write it anyway.
- Keep the raw chapter label verbatim. Put it in `Notes` or `ScanInformation` and in the DB. ComicInfo `Number` carries the arbitrated number, not the raw label.

### HTTP, parsing and config

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| `undici` | 8.12.3 | HTTP in the parent: `Agent` per host, `ProxyAgent`, streaming bodies, timeouts | Implements the host's `scheduleRequest` and image download. Import `fetch`/`request` from the package, not the global, so dispatcher and client versions match. | MEDIUM-HIGH |
| `cheerio` | 1.2.0 | HTML parsing | Phase 2 recipe engine (Madara, MangaThemesia) only. Extension bundles carry their own copy. | HIGH |
| `yaml` | 2.9.1 | Parse recipe/site definitions | Phase 2. Validate with zod. YAML carries config, never selectors. | HIGH |
| `pino` | 10.4.0 | Structured logs | All three process types. JSON to stdout. | HIGH |
| Node `--env-file` | built in | Load `.env` | Replaces `dotenv`. Secrets come from 1Password, not tracked files. | HIGH |

### Web UI and auth

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| `@mantine/core`, `@mantine/hooks` | 9.7.4 | Component library | Reuse from descent-app. Needs React ^19.2. | HIGH |
| `mantine-datatable` | 9.4.0 | Tables (works, sources, jobs) | Reuse from descent-app. Peer: Mantine >= 9. | HIGH |
| `@tanstack/react-query` | 5.105.2 | Client polling for job state | Only where Server Components and revalidation do not fit. | MEDIUM |
| `@node-rs/argon2` | 2.2.2 | Password hashing | Own session table in Postgres, own API-key table. Auth is Phase 8 work. Defer a full library. Better Auth 1.7.15 is the alternative if multi-user scope grows. The Komga API needs Basic auth and `X-API-Key` against the app's own user table, which favours owning the tables. | MEDIUM |

### Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker + Compose | current | `docker compose up` end to end (#8) | Required deliverable. | HIGH |
| `node:26-slim` (Debian trixie) | 26.13 | Base for `web`, `js-worker` | glibc keeps `sharp` simple. Next `standalone` output keeps the web image small. | HIGH |
| `postgres:18` | 18.6 | DB service | Healthcheck with `pg_isready`. Named volume. | HIGH |
| Kavita `jvmilazz0/kavita:0.9.1` | 0.9.1 (pin; `nightly-*` tags exist, do not use) | Verification target in Compose, behind `profiles: [verify]` | Proves "Kavita opens it". The mount for `/kavita/config` and a read-only mount of the library. | HIGH |
| Komga `gotson/komga` | 1.29.2 | Second verifier for the `/api/v1` emulation (Phase 6) | Not needed in Phase 1. | MEDIUM |

Headless Kavita smoke script (Node, `fetch`, no browser). Endpoints confirmed in Kavita's `develop` source: `POST /api/Account/register` (anonymous), `POST /api/Account/login`, `POST /api/Library/create`, `POST /api/Library/scan`. Flow: register first admin, log in for a JWT, create a library on the mounted path, scan, poll series, assert one series with N pages. **SPIKE:** confirm first-user registration works on a fresh DB with no invite. The `Kavita.Server/Controllers/` layout is recent, so pin the image tag and re-check on upgrade.

### Solver (Cloudflare) - Phase 7, not Phase 1

| Technology | Version | Purpose | Recommendation | Confidence |
|------------|---------|---------|----------------|------------|
| FlareSolverr | v3.5.2 (2026-09-12, MIT, Chromium, pushed 2026-10-24) | Solve a CF challenge, return cookies + HTML via `/v1` (`request.get`, `sessions.create/list/destroy`) | Alive and released. Third-party blogs call it "archived" or broken. That claim conflicts with the repo's release log, so treat it as unverified. Its README says no captcha solvers work. | MEDIUM |
| Byparr | v3.0.4 (2026-08-18, GPL-3.0, Camoufox/Firefox, pushed 2026-11-02) | Same job, different engine | Run as a separate container (GPL does not touch AGPL code across a process boundary, and the two licences are compatible). Sources claim FlareSolverr-compatible API. The README documents its own `/docs` and `/load`. | LOW-MEDIUM |
| `patchright` | 1.64.2 | Node-native fallback (patched Playwright) | Only if both sidecars fail the spike. Larger surface to own. | LOW |

Recommendation: define a `SolverClient` interface in `core` with the FlareSolverr `/v1` shapes. Run FlareSolverr and Byparr as interchangeable containers behind one URL setting. Choose the default by measuring both against the 64 Cloudflare-blocked sources from Phase 0. **SPIKE (Phase 7):** a solver returns HTML only. Page images still come from `js-worker` with the solver's `cf_clearance` cookie and UA replayed. `cf_clearance` is tied to IP and UA, and sometimes to the TLS fingerprint, so undici may be rejected where Chrome is not. This is the "solver identity matching" item. Plan for a "fetch through the solver session" fallback for images.

### Dev tooling

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| `vitest` | 5.0.5 | Unit and integration tests | Needs Node ^22.12 / ^24 / >=26 and Vite 6.4 / 7 / 8. Install `vite` ^8.3.5 as a dev dependency. Use `projects` for `web`, `js-worker`, `core`. | HIGH |
| `@vitest/coverage-v8` | 5.0.5 | Coverage | Version must match `vitest`. | HIGH |
| `testcontainers` + `@testcontainers/postgresql` | 12.2.1 | Real Postgres for pg-boss and drizzle tests | Real PG, not mocks. One container per run via `globalSetup`. Needs Node >= 22.22 and Docker. pg-boss also has a `pglite` backend. Do not use it for tests of group concurrency and `key_strict_fifo`, because fidelity is unproven. | MEDIUM-HIGH |
| `@biomejs/biome` | 2.6.4 | Lint and format | One tool. Avoids the `typescript-eslint` TS-version cap. Gives up some Next-specific ESLint rules. If those matter, add `eslint` 10.14.0 + `eslint-config-next` 16.4.4 for Next rules only. | MEDIUM |

TypeScript config for `apps/js-worker` and `packages/core` (from the Node 26 docs): `noEmit`, `target: esnext`, `module: nodenext`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`. No enums, no namespaces with values, no parameter properties. Use `#`-prefixed subpath imports in `package.json` instead of `paths`. Type stripping ignores `tsconfig.json` and does not run on files in `node_modules`. The web app compiles through Next, so it can import `core` as `.ts` source.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| TypeScript | 6.0.3 | 7.0.2 | `next build` fails without the JS compiler API. |
| Paperback polyfills | Vendored alpha.64 | `patch-package` on the npm package | Cannot fix state and `scheduleRequest`, which need to change shape (RPC), not a one-line patch. Patches on `node_modules` are the Phase 0 manual step to remove. |
| Paperback version | alpha.64 | alpha.92 | Different API generation (no search filters, new base64). Re-run the 418-source sweep before any move. |
| Sandbox | Child process + `--permission` + parent-proxied HTTP | `isolated-vm` 7.0.2 | A true V8 isolate with no Node APIs is stronger. It is a native addon (Node >= 24) and extension bundles expect Node-flavoured globals. Revisit in Phase 8 "real sandboxing". |
| Sandbox | same | `node:vm`, `vm2` | `node:vm` is not a boundary (hard rule). `vm2` is deprecated. |
| Sandbox | Child process | `Worker` threads | Same heap process, shared memory pressure, `--allow-worker` semantics differ. Hard rule says process. |
| Queue | pg-boss 12 | BullMQ + Redis, Graphile Worker | Decided. No extra service. |
| ORM | drizzle 0.45.4 | drizzle 1.0.0-rc.5; Prisma | RC changes migrations and relations. Revisit after v1 GA. Prisma not decided. |
| Driver | `pg` | `postgres` 4.0.0 | pg-boss already pulls `pg`. |
| Zip write | `yazl` | `archiver` 8.0.0, `fflate` 0.8.3, `@zip.js/zip.js` 2.24.0, `jszip` | `archiver` brings nine dependencies for a queue-based API. `fflate` is fine but not stream-first for large files. `jszip` buffers whole archives in memory. |
| Zip read | `yauzl` | `adm-zip`, `node-stream-zip` | `adm-zip` reads whole files into memory. |
| XML | `fast-xml-parser` | `xmlbuilder2` 4.0.3, `xml2js` | Builder-only or legacy. One library for both directions wins. |
| pHash | In-house DCT | `imghash`, `blockhash-core` | Unmaintained. The 14-bit threshold was validated on the in-house algorithm. |
| Lint | Biome | ESLint 10 + `typescript-eslint` 8.72 | Peer cap `typescript <6.1`, two config systems. |
| Dotenv | `--env-file` | `dotenv` 18 | Not needed on Node 26. |
| TS runner | Node type stripping | `tsx` 4.23, `ts-node` | Not needed on Node 26 for `js-worker` and scripts. |
| Solver | Sidecar behind `/v1` interface | Own Playwright/patchright solver now | Out of Phase 1 scope. Own it only if both sidecars fail. |
| OPDS | Hand-rendered XML templates | `opds-ts` 3.0.0 | Phase 6. The feeds are small and the PSE `<link rel="http://vaemendis.net/opds-pse/stream">` needs exact control. Evaluate then. |
| Acquisition | Own JS worker | Suwayomi sidecar | Deleted unbuilt by decision 0001. Do not add. |

## Installation

```bash
# Root workspace (Node 26, npm 11)
npm init -w apps/web -w apps/js-worker -w packages/core -y

# packages/core
npm i -w packages/core zod@4.6.7 fast-xml-parser@5.11.2 yaml@2.9.1

# apps/web
npm i -w apps/web next@16.4.4 react@19.3.1 react-dom@19.3.1 \
  drizzle-orm@0.45.4 pg@8.23.1 pg-boss@12.38.0 \
  @mantine/core@9.7.4 @mantine/hooks@9.7.4 mantine-datatable@9.4.0 \
  @tanstack/react-query@5.105.2 @node-rs/argon2@2.2.2 pino@10.4.0 clsx

# apps/js-worker  (parent supervisor; the extension child runs untrusted code)
npm i -w apps/js-worker pg-boss@12.38.0 pg@8.23.1 drizzle-orm@0.45.4 \
  undici@8.12.3 yazl@3.3.1 yauzl@3.4.0 sharp@0.35.5 \
  entities@^7.0.0 user-agents@^1.1.669 pino@10.4.0

# Dev dependencies (root)
npm i -D typescript@6.0.3 @types/node@26.6.6 @types/pg@8.23.1 \
  @types/yazl@3.3.1 @types/yauzl@3.4.0 \
  @paperback/types@1.0.0-alpha.64 \
  drizzle-kit@0.31.11 vitest@5.0.5 @vitest/coverage-v8@5.0.5 vite@^8.3.5 \
  testcontainers@12.2.1 @testcontainers/postgresql@12.2.1 @biomejs/biome@2.6.4

# Pin exactly: pg-boss, @paperback/*, sharp, typescript, drizzle-*  (use `npm i -E`)
```

Add a `.node-version` of `26` and `"engines": { "node": ">=26" }` on the application packages. Commit the lockfile. Do not add `husky` or `lint-staged` until CI exists.

## Phase 1 spikes (open items for the plan)

| # | Question | Pass condition |
|---|----------|----------------|
| 1 | Does a child under `node --permission` (no grants) run a converted-Keiyoushi bundle with IPC for HTTP and state? | The 5 smoke sources from Phase 0 pass the full chain. Fs, net, child and worker calls from inside the bundle throw `ERR_ACCESS_DENIED`. |
| 2 | Does `groupConcurrency` hold a per-host cap across two `js-worker` processes? | At most N active jobs per host id under load, with jobs for other hosts unblocked. |
| 3 | Does the web producer work with `supervise:false, schedule:false, migrate:false, registerInstance:false`? | `send()` succeeds. The worker still migrates and supervises. |
| 4 | Does Kavita 0.9.1 accept first-user `register` on a fresh volume, and scan a `yazl`-written CBZ that has `ComicInfo.xml`? | Smoke script exits 0 with the series visible and page count correct. |

## Open questions for the architecture phase

- **Where do byte-touching jobs run?** Decision 0001 allows only `js-worker` and `solver`. CBZ assembly (`finalize`) and page fingerprinting (Assay, Phase 5) touch image bytes. The hard rule keeps bytes out of the web process. Recommendation: run them as pg-boss queues consumed by the `js-worker` parent (trusted supervisor), never in the extension child and never in `web`. Confirm in the plan.
- **Serving pages and CBZ.** The Komga API and OPDS-PSE must stream page bytes to readers from the web process. That conflicts with a literal reading of the hard rule. Recommendation: read the rule as "ingestion bytes". Serve from disk with Range support in route handlers (`yauzl` for single-page extraction, optional `sharp` resize) or hand off to a reverse proxy with `X-Accel-Redirect`. Confirm the intended reading.

## Sources

Registry versions: `npm view` on 2026-11-02 (HIGH). Docs and repos read on 2026-11-02, with the archived copy beside the original.

- [pg-boss docs: queues](https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4382) (policies, retry, `heartbeatSeconds`, `deadLetter`) - HIGH
- [pg-boss docs: workers](https://github.com/timgit/pg-boss/blob/master/docs/api/workers.md) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4381) (`groupConcurrency`, `localConcurrency`, `batchSize`) - HIGH
- [pg-boss docs: jobs](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4396) (`group {id, tier}`, `singletonKey`) - HIGH
- [pg-boss docs: constructor](https://github.com/timgit/pg-boss/blob/master/docs/api/constructor.md) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4397) (`supervise`, `schedule`, `migrate`, `registerInstance`) - HIGH
- [pg-boss releases](https://github.com/timgit/pg-boss/releases) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4359) (12.37.1 fix, 12.38.0 changes) - HIGH
- [Node 26 Permission Model](https://nodejs.org/docs/latest-v26.x/api/permissions.html) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4388) (flags, "not a security boundary", `--allow-net` all-or-nothing, `_debugProcess`) - HIGH
- [Node 26 TypeScript](https://nodejs.org/docs/latest-v26.x/api/typescript.html) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4398) (type stripping stable, limits, tsconfig) - HIGH
- [Node previous releases](https://nodejs.org/en/about/previous-releases) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4358) (26 is LTS, latest 26.13.0) - HIGH
- [PostgreSQL versioning](https://www.postgresql.org/support/versioning/) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4395) (18.6 current, 19 at RC1) - HIGH
- [Drizzle upgrade to v1 RC](https://orm.drizzle.team/docs/upgrade-v1) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4394) - MEDIUM
- [ComicInfo.xsd (anansi-project, draft v2.1)](https://raw.githubusercontent.com/anansi-project/comicinfo/main/drafts/v2.1/ComicInfo.xsd) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4351) (element order, enums) - HIGH
- [Kavita metadata (ComicInfo) guide](https://wiki.kavitareader.com/guides/metadata/comics/) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4366) (fields Kavita reads) - HIGH
- Kavita `develop` source (`Kavita.Server/Controllers/AccountController.cs`, `LibraryController.cs`) read through `gh api` - MEDIUM (layout is recent)
- [`@paperback/runtime-polyfills@1.0.0-alpha.92`](https://app.unpkg.com/@paperback/runtime-polyfills@1.0.0-alpha.92) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4383), compared by file diff against alpha.64 (bugs unchanged, search-filter manager removed) - HIGH
- [r52/gagaku](https://github.com/r52/gagaku) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4387) (MIT; extension host in `extension/`, v0.9 only; the page does not describe its polyfills) - MEDIUM
- [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4391) (API, image); releases via `gh api` - MEDIUM
- [Byparr](https://github.com/ThePhaseless/Byparr) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4075) (Camoufox, GPL-3.0, limits) - MEDIUM
- Next.js TypeScript 7 status: [vercel/next.js#96110](https://github.com/vercel/next.js/pull/96110), [#95633](https://github.com/vercel/next.js/discussions/95633), [documentdb.github.io#97](https://github.com/documentdb/documentdb.github.io/pull/97) via web search - MEDIUM (secondary reports, consistent)
- Cloudflare solver blog comparisons (scrapeops, scrapfly, bytesized-hosting and others) via web search - LOW, used only to name candidates
- Phase 0 code and results: `probes/phase-0/host.mjs`, `phash.mjs`, `README.md`, `patches/` - HIGH (first-party measurements)
