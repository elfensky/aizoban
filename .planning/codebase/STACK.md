---
last_mapped_commit: 035a59a331061875257f45c83895c44d3cd9aad7
last_mapped_at: 2026-11-02
---
# Technology Stack

**Analysis Date:** 2026-11-02

## Status

The repository has no application code yet. The only executable code is the Phase 0 probe
scripts under `probes/phase-0/`. Items marked **(present)** exist in the repo today. Items marked
**(planned)** come from `AGENTS.md` and `docs/decisions/0001-acquisition-make-or-buy.md`. They do
not exist yet.

## Languages

**Primary:**
- JavaScript (ES modules, `.mjs`) (present) - all Phase 0 probe scripts, e.g. `probes/phase-0/host.mjs`,
  `probes/phase-0/sweep418.mjs`, `probes/phase-0/runner-child.mjs`, `probes/phase-0/phash.mjs`
- TypeScript (planned) - application code: Next.js web process and worker processes. Named in `AGENTS.md` (## Stack).

**Secondary:**
- Markdown (present) - documentation and decision records: `README.md`, `AGENTS.md`,
  `probes/phase-0/README.md`, `docs/decisions/0001-acquisition-make-or-buy.md`
- JSON (present) - probe configuration and fixtures: `probes/phase-0/works.json`,
  `probes/phase-0/fixtures/chapters/*.json`, `probes/phase-0/results/drift-report.json`
- JSON Lines (present) - resumable sweep output: `probes/phase-0/results/sweep418.jsonl`,
  `probes/phase-0/results/retry-empty.jsonl`
- Patch files (present) - `probes/phase-0/patches/runtime-polyfills-interceptor-chain.patch`
- Shell / plain text (present) - `probes/phase-0/results/empty-search-ids.txt`
- Planned output formats (planned): CBZ archives with `ComicInfo.xml`, OPDS / OPDS-PSE feeds,
  and a Komga-compatible API. These are product outputs, not current code.

## Runtime

**Environment:**
- Node.js 26 (present, probe runtime) - the Phase 0 probes ran on Node 26 on macOS
  (`probes/phase-0/README.md`). The local interpreter is `v26.12.1`.
- Node.js (planned) - the newest LTS line applies to Docker bases, CI and `.node-version` / mise
  files. Per the user's global rule, use the even major in Active LTS. Node 26 is the target as of
  2026-10-28. No `.node-version`, `.nvmrc`, `.tool-versions` or `engines` field exists yet.
- Probe `engines` floor (present): `sharp` 0.35.3 requires `node >=20.9.0`, per
  `probes/phase-0/package-lock.json`.

**Package Manager:**
- npm (present, for probes) - `probes/phase-0/package.json`
- Lockfile: present for probes at `probes/phase-0/package-lock.json` (lockfileVersion 3).
  The repo root has no lockfile. The planned Next.js app does not exist yet.
- Root `package.json`: **missing**. The application package is planned, not present.

## Frameworks

**Core (planned):**
- Next.js - web process and Komga-compatible / OPDS HTTP API. Source: `AGENTS.md` (## Stack).
- PostgreSQL - the database. Source: `AGENTS.md` (## Stack). No schema, migrations or client are present.
- `pg-boss` - Postgres-backed job queue for worker processes. Source: `AGENTS.md` (## Stack).
- `js-worker` - acquisition worker process (Paperback 0.9 host + recipe engine). Source:
  `docs/decisions/0001-acquisition-make-or-buy.md`.
- `solver` - Cloudflare challenge worker. Planned, added "when the Cloudflare work lands" per
  decision 0001. Not present.

**Probe host (present):**
- Paperback 0.9 host - a plain Node host that runs community extension bundles in a `node:vm`
  context. Implemented in `probes/phase-0/host.mjs`. Per the file's own comment, `node:vm` is fine
  for measurement scripts. `AGENTS.md` states `node:vm` is not a security boundary for the product.

**Testing (present):**
- No test framework is configured. `probes/phase-0/package.json` has a placeholder
  `"test": "echo \"Error: no test specified\" && exit 1"`.

**Build/Dev (present):**
- None for the probes. They run directly with `node <script>.mjs`.
- Planned: Next.js build tooling, TypeScript compiler. Not configured.

## Key Dependencies

**Critical (present, probes only):**
- `@paperback/runtime-polyfills` `1.0.0-alpha.64` - Paperback runtime polyfills (`ApplicationPolyfill`,
  `RequestManager`). Imported by `probes/phase-0/host.mjs`. It has two known bugs. The interceptor
  chain passes the original request to every interceptor. `formDidChange` is called but not
  implemented. The fix is in `probes/phase-0/patches/runtime-polyfills-interceptor-chain.patch`,
  applied by hand to `node_modules` after install. Decision 0001 says to fix or upstream these on
  day one.
- `@paperback/types` `1.0.0-alpha.64` - type definitions for Paperback extensions. Declared in
  `probes/phase-0/package.json`. No direct import found in the probe scripts.
- `sharp` `0.35.3` - image processing (libvips binding). Imported by `probes/phase-0/phash.mjs` and
  `probes/phase-0/phash-aligned.mjs` for perceptual hashing. Platform binaries are pulled as
  optional packages (`@img/sharp-darwin-arm64`, `@img/sharp-linux-x64`, and others) in
  `probes/phase-0/package-lock.json`.

**Node built-ins used by probes (present):**
- `node:vm` - extension sandbox in the probe host (`probes/phase-0/host.mjs`).
- `node:fs`, `node:path`, `node:url` - fixtures and results I/O.
- `node:child_process` - one child process per source in `probes/phase-0/sweep418.mjs`, running
  `probes/phase-0/runner-child.mjs`.
- Global `fetch`, `AbortController`, `setTimeout` - HTTP and per-stage timeouts (45 s stage limit,
  30 s `vm` timeout, set in `probes/phase-0/host.mjs`).

**Infrastructure (planned):**
- `pg-boss` (job queue), Postgres client and ORM: not chosen in code. Not present.
- Cloudflare solver library: not chosen. Not present.
- Kotlin / Suwayomi sidecar: **deleted unbuilt** per decision 0001. Do not add.

## Configuration

**Environment:**
- No environment variable is read by the probes. `probes/phase-0/` reads its config from
  `probes/phase-0/works.json` and CLI flags (`--registry`, `--concurrency`, `--only`, `--source`).
- No `.env` file is tracked. `.gitignore` lists `node_modules/`, `probes/phase-0/bundles/`,
  `probes/phase-0/fixtures/pages/`, `probes/phase-0/fixtures/pages-full/`,
  `probes/phase-0/results/*.log`, `.DS_Store` and `.worktrees/`.
- Planned: secrets and connection strings go to 1Password (user rule). A machine-readable
  config for YAML site definitions is planned. `AGENTS.md` says YAML definitions carry config
  only, never selectors.

**Build:**
- None present. No `tsconfig.json`, `next.config.*`, ESLint, Prettier or Biome config in the repo.

**Repository hygiene (present):**
- `.gitignore` as above. `CLAUDE.md` is a symlink to `AGENTS.md`.
- Licence: AGPL-3.0 (`LICENSE`, `README.md`). Probe-only dependency licences noted in code:
  `bundles/` holds GPL-3.0 extension code and is never committed.

## Platform Requirements

**Development:**
- Node.js 26 (current probe target). Run `npm install` in `probes/phase-0/`, then apply the
  interceptor patch to `node_modules` by hand.
- `sharp` needs a platform-matching libvips binary. The lockfile covers darwin, linux (glibc and musl),
  freebsd-wasm32 and wasm32 targets.
- Network access to the source registries listed in `probes/phase-0/works.json` and
  `probes/phase-0/fetch-pages.mjs` (see INTEGRATIONS.md).

**Production (planned):**
- Next.js web process, separate `js-worker` process (+ `solver` when added), and PostgreSQL.
  Per decision 0001, Phase 1 has nothing else.
- Import mount is read-only. Staging and canonical library are on disk. Exact paths and container
  images are not defined yet.
- Docker is not configured in the repo. Planned: Docker bases on the newest LTS Node.

---

*Stack analysis: 2026-11-02*
