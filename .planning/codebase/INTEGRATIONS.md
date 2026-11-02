---
last_mapped_commit: 035a59a331061875257f45c83895c44d3cd9aad7
last_mapped_at: 2026-11-02
---
# External Integrations

**Analysis Date:** 2026-11-02

## Status

No product integration exists yet. The integrations below come from the Phase 0 probes
(`probes/phase-0/`), which run as measurement scripts. Items marked **(planned)** come from
`AGENTS.md` and `README.md`. They are not implemented.

## APIs & External Services

**Extension registries (present, probes):**
Community source extensions are fetched as compiled JavaScript bundles from static registry hosts.
The probes run these bundles in a `node:vm` sandbox (`probes/phase-0/host.mjs`).
- Keiyoushi-derived PaperbackExt registry (0.9 stable) - source of most extension bundles
  - Base URL: `https://nicartjay.github.io/PaperbackExt/0.9/stable`
  - Endpoints used: `/versioning.json` (`probes/phase-0/sweep418.mjs`), `/<SourceId>/index.js`
    (`probes/phase-0/runner-child.mjs`, `probes/phase-0/fetch-chapters.mjs`,
    `probes/phase-0/fetch-pages.mjs`, `probes/phase-0/fetch-pages-all.mjs`)
  - Auth: none (public static files)
  - Client: global `fetch` (Node)
- Inkdex registry (0.9 stable) - used for WeebCentral and MangaDex in `probes/phase-0/works.json`
  - Base URL: `https://inkdex.github.io/extensions/0.9/stable`
  - Endpoint used: `/<SourceId>/index.js`
  - Auth: none
  - Client: global `fetch`
- Registries are configured by URL in `probes/phase-0/works.json`, `probes/phase-0/fetch-pages.mjs`,
  `probes/phase-0/fetch-pages-all.mjs`, and the `--registry` flag of `probes/phase-0/sweep418.mjs`.
  Bundle files are cached under `probes/phase-0/bundles/` (git-ignored).
- Planned: user-added source repositories at runtime, with provenance recorded. `AGENTS.md` says
  extensions are never bundled in this repo.

**Source websites (present, probes; scraped indirectly via extension code):**
The extension bundles call these sites. The probe host calls them through the Paperback request
layer. Sites listed in `probes/phase-0/fetch-pages.mjs` and `probes/phase-0/fetch-pages-all.mjs`:
- `https://weebcentral.com/`, `https://ww2.mangafreak.me/`, `https://mangapill.com/`,
  `https://www.mangatown.com/`, `https://asuracomic.net/`, `https://madaradex.org/`,
  `https://kunmanga.com/`, `https://mangadex.org/`
- Also named in `probes/phase-0/fixtures/chapters/` filenames and `probes/phase-0/README.md`:
  ComicKFan, MangaFox, KunMangaOnline, MadaraDex, AsuraScans, and others from the converted registry.
- Auth: none in the probes. Requests send a browser-like `headers` object (see `fetch-pages.mjs`).
- Failure classes recorded in `probes/phase-0/results/sweep418.jsonl`: `CLOUDFLARE_CHALLENGE`
  (64 of 196 failures), `EMPTY_SEARCH`, `EXTENSION_CRASH`, `EMPTY_CHAPTERS`, `NETWORK`,
  `PARSER_CHANGED`, `TIMEOUT`.

**Cloudflare (present as a blocker, planned as a dependency):**
- 64 of 196 sweep failures are Cloudflare challenges. The probe host detects them by message match
  (`probes/phase-0/host.mjs`: `/cloudflare|cf_clearance|challenge/i`).
- Planned: a `solver` worker, added "when the Cloudflare work lands" (`docs/decisions/0001-acquisition-make-or-buy.md`).
  Not present. No solver library or service is chosen.

**Image and page content (present, probes):**
- Page images are fetched directly from source CDNs and pages, then hashed with `sharp`
  (`probes/phase-0/phash.mjs`, `probes/phase-0/phash-aligned.mjs`). Fixture pages are git-ignored
  (`probes/phase-0/fixtures/pages/`, `probes/phase-0/fixtures/pages-full/`).

**Planned external services (not present):**
- Komga / Kavita / OPDS readers - consumers of Aizoban's API, not called by it. Planned.
- Paperback, Mihon, Panels - reader clients that connect to the planned API. Planned.
- Suwayomi sidecar - explicitly **not** in Phase 1. Escape hatch only, with switching triggers in
  `docs/decisions/0001-acquisition-make-or-buy.md`.
- GitHub - issue tracker and PR flow (`elfensky/aizoban`, referenced in `README.md`,
  `probes/phase-0/README.md`, `AGENTS.md` cockpit section). Not a runtime integration.

## Data Storage

**Databases:**
- PostgreSQL (planned). Source: `AGENTS.md` (## Stack). Not present.
  - Connection: not defined. No connection string, env var or client is in the repo.
  - Client: not chosen. Planned: `pg-boss` uses Postgres as its job store.

**File Storage:**
- Local filesystem only (present, probes):
  - `probes/phase-0/fixtures/chapters/*.json` - chapter metadata, committed as the regression corpus
  - `probes/phase-0/results/*.jsonl`, `probes/phase-0/results/drift-report.json` - measurement output
  - `probes/phase-0/bundles/` and `probes/phase-0/fixtures/pages*/` - git-ignored caches
- Planned (per `AGENTS.md` hard rules):
  - Canonical library on disk: one directory tree, CBZ + `ComicInfo.xml`
  - Staging area: workers write with a manifest, then atomically rename into the library
  - Import mount: read-only, copied from, never written to
  - Exact paths are not defined in the repo.

**Caching:**
- None in the application (planned). Probe caching is file-based: the extension bundle cache in
  `probes/phase-0/bundles/` and resumable JSONL sweep records in `probes/phase-0/results/`.

## Authentication & Identity

**Auth Provider:**
- Not detected for the probes. No login, OAuth or API key is used.
- Planned: multi-user, single-tenant. Per-user views are scoped by API key. Implementation is not
  defined. Komga-compatible API and OPDS clients authenticate against it.
- Source site cookies: the Paperback polyfill includes a cookie store interceptor
  (`@paperback/runtime-polyfills`, `RequestManager`). Cookies are kept in memory by the probe host.
  Not persisted.

## Monitoring & Observability

**Error Tracking:**
- None configured.

**Logs:**
- Probe scripts write progress and results to `console.error` / `console.log` and JSONL
  (`probes/phase-0/sweep418.mjs`). `probes/phase-0/results/*.log` is git-ignored.
- Planned: no logging framework chosen.

## CI/CD & Deployment

**Hosting:**
- Not configured. No deployment target, Dockerfile or compose file exists in the repo.
- Planned: Next.js web process, `js-worker`, optional `solver`, and PostgreSQL as separate processes.
  Docker bases should use the newest LTS Node (user rule).

**CI Pipeline:**
- None detected. No `.github/workflows/`, no CI config in the repo.

## Environment Configuration

**Required env vars:**
- None. The probes read no environment variables.
- Planned: a Postgres connection string, Komga / OPDS auth settings, and registry URLs will need
  configuration when the application is built. Names are not defined yet.

**Secrets location:**
- None in the repo. No `.env` file is tracked. `.gitignore` does not list `.env` files.
- Planned rule (user global instructions): every secret goes to 1Password. Machine-read values go
  through the vault `Infrastructure` robot account by pipe. Do not commit secrets.

## Webhooks & Callbacks

**Incoming:**
- None (planned: none defined). The planned API is pull-based (Komga-compatible HTTP and OPDS).

**Outgoing:**
- Outgoing HTTP only, from probes: registry bundle downloads and source site requests listed above.
- No webhooks configured.

---

*Integration audit: 2026-11-02*
