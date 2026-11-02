---
last_mapped_commit: 035a59a331061875257f45c83895c44d3cd9aad7
last_mapped_at: 2026-11-02
---
# Codebase Structure

**Analysis Date:** 2026-11-02

## Status

The repository holds documentation, one decision record, and Phase 0 measurement scripts.
No application source tree exists yet. Directories marked **(planned)** do not exist in git.

## Directory Layout

```
aizoban/                             # repository root
├── AGENTS.md                        # Agent instructions, theses, hard rules, stack (tracked)
├── CLAUDE.md -> AGENTS.md           # Symlink to AGENTS.md (tracked)
├── README.md                        # Product overview and Phase 0 status (tracked)
├── LICENSE                          # AGPL-3.0 licence text (tracked)
├── .gitignore                       # Ignore rules (tracked)
├── docs/
│   └── decisions/
│       └── 0001-acquisition-make-or-buy.md   # Architecture decision record (tracked)
├── probes/
│   └── phase-0/                     # Phase 0 measurement harness (tracked)
│       ├── README.md                # Method, results and caveats (tracked)
│       ├── package.json             # Probe dependencies, ESM (tracked)
│       ├── package-lock.json        # (tracked)
│       ├── host.mjs                 # Paperback 0.9 host and error taxonomy
│       ├── runner-child.mjs         # One-source child process
│       ├── sweep418.mjs             # Registry sweep orchestrator
│       ├── fetch-chapters.mjs       # Chapter list capture
│       ├── fetch-pages.mjs          # Sample pages (1, N/2, N)
│       ├── fetch-pages-all.mjs      # Full-chapter page capture
│       ├── analyze-drift.mjs        # Ordinal drift analysis
│       ├── phash.mjs                # pHash and dHash, index-based
│       ├── phash-aligned.mjs        # pHash, content-aligned
│       ├── works.json               # Work list for chapter capture
│       ├── patches/
│       │   └── runtime-polyfills-interceptor-chain.patch
│       ├── results/                 # Probe outputs (mostly tracked)
│       │   ├── sweep418.jsonl
│       │   ├── retry-empty.jsonl
│       │   ├── empty-search-ids.txt
│       │   └── drift-report.json
│       └── fixtures/
│           └── chapters/            # Committed metadata corpus (*.json)
└── .planning/
    └── codebase/                    # Mapper output (git-ignored, see below)
```

Generated and ignored paths, relative to `probes/phase-0/`:
- `bundles/`: cached GPL-3.0 extension bundles. Written by `fetch-chapters.mjs`.
- `fixtures/pages/`: copyrighted page images. Written by `fetch-pages.mjs`.
- `fixtures/pages-full/`: copyrighted page images. Written by `fetch-pages-all.mjs`.
- `results/*.log`: log files, ignored by pattern.
- `node_modules/`: ignored at every level.

## Directory Purposes

**`docs/decisions/`:**
- Purpose: numbered architecture decision records. Each record cites the probe numbers that
  drove it.
- Contains: `NNNN-kebab-title.md`
- Key files: `docs/decisions/0001-acquisition-make-or-buy.md`

**`probes/phase-0/`:**
- Purpose: Phase 0 de-risk measurements. Run by hand with Node. Not part of any runtime.
- Contains: Node ESM scripts (`.mjs`), one JSON manifest (`works.json`), a patch, results,
  and fixtures.
- Key files: `probes/phase-0/README.md`, `probes/phase-0/host.mjs`, `probes/phase-0/sweep418.mjs`

**`probes/phase-0/fixtures/chapters/`:**
- Purpose: committed regression corpus of chapter lists per work × source.
- Contains: `<work-key>--<SourceId>.json`, with raw chapter labels kept verbatim.
- Key files: e.g. `probes/phase-0/fixtures/chapters/berserk--MangaFox.json`

**`probes/phase-0/results/`:**
- Purpose: output of sweeps and analyses. Append-only JSONL for resumable runs.
- Contains: `sweep418.jsonl`, `retry-empty.jsonl`, `empty-search-ids.txt`, `drift-report.json`

**`probes/phase-0/patches/`:**
- Purpose: fixes for upstream `@paperback/runtime-polyfills`, applied to `node_modules` by hand.
- Contains: `runtime-polyfills-interceptor-chain.patch`

**`.planning/codebase/` (this directory):**
- Purpose: codebase map documents for GSD commands.
- Contains: `ARCHITECTURE.md`, `STRUCTURE.md`, and other mapper focus documents.
- Git status: ignored. `.gitignore` contains `codebase/`, which matches this directory at any depth.
  Files here are not committed unless the ignore rule changes.

## Key File Locations

**Entry Points (present):**
- `probes/phase-0/sweep418.mjs`: registry sweep CLI
- `probes/phase-0/runner-child.mjs`: child worker for one source (not run directly)
- `probes/phase-0/fetch-chapters.mjs`: chapter fixture CLI
- `probes/phase-0/fetch-pages-all.mjs`: full-page fixture CLI
- `probes/phase-0/analyze-drift.mjs`: drift report CLI

**Configuration (present):**
- `probes/phase-0/package.json`: `"type": "module"`, dependencies `@paperback/runtime-polyfills`,
  `@paperback/types`, `sharp`
- `probes/phase-0/works.json`: work keys, titles, and per-source registry map
- `.gitignore`: root ignore rules
- `CLAUDE.md`: symlink to `AGENTS.md`

**Core Logic (present):**
- `probes/phase-0/host.mjs`: extension loading, chain run, error classes
- `probes/phase-0/phash-aligned.mjs`: content-aligned page comparison

**Documentation (present):**
- `README.md`: product overview
- `AGENTS.md`: agent rules, theses, measured facts, stack
- `docs/decisions/0001-acquisition-make-or-buy.md`: acquisition decision
- `probes/phase-0/README.md`: probe results and caveats

**Testing (present):**
- None. `probes/phase-0/package.json` `test` script is a placeholder that exits 1.
- Regression corpus: `probes/phase-0/fixtures/chapters/`

**Planned locations (not present):**
- Web process source: `src/` or `app/` (Next.js), not yet created
- Worker source: `js-worker` directory, not yet created
- Migrations and schema: not yet created
- Phase 1 issues: milestone "Phase 1 — skeleton" tracked in the `elfensky/aizoban` tracker

## Naming Conventions

**Files:**
- Probe scripts: `kebab-case.mjs`, named after the job (`fetch-pages-all.mjs`, `phash-aligned.mjs`).
- Probe entry runners: `runner-child.mjs` for the child process form of a runner.
- Fixtures: `<work-key>--<SourceId>.json`, with a double hyphen between work and source.
  Work keys are kebab-case (`jujutsu-kaisen`). Source IDs keep their registry casing
  (`WeebCentral`, `MangaFox`).
- Decision records: `NNNN-kebab-title.md`, four-digit number (`0001-...`).
- Result files: `kebab-case.jsonl` or `.json`.
- Top-level docs: `UPPERCASE.md` (`README.md`, `AGENTS.md`).

**Directories:**
- Lowercase, kebab-case (`probes/phase-0`, `docs/decisions`).
- Phase directories use `phase-N` (`phase-0`).

**Code style (present):**
- ESM `import`/`export`, `node:` prefixed built-ins (`node:vm`, `node:fs`, `node:path`).
- No linter or formatter config is present. Semicolon use differs between probe files.

## Where to Add New Code

**New Phase 0 measurement:**
- Script: `probes/phase-0/<name>.mjs`, following the header comment style
  (`// aizoban#N — purpose`).
- Output: `probes/phase-0/results/<name>.jsonl`, resumable by skipping recorded IDs.
- Fixtures: `probes/phase-0/fixtures/<area>/`. Commit metadata only. Keep images and bundles
  in gitignored folders.

**New decision record:**
- File: `docs/decisions/NNNN-kebab-title.md` with the next number.
- Cite the probe numbers and results that drove the decision.

**New application code (planned, Phase 1):**
- Follow the process split in `AGENTS.md`: the web process and each worker are separate processes.
  Put each under its own top-level directory.
- Worker sandbox code goes in a separate process directory with no DB or FS access.
- Shared types for the Census model (Work, Witness, Slot, Fill) go in one shared package, not
  duplicated per process.
- YAML site definitions go under a data directory and carry config only, never selectors.
- Tests: no convention yet. Add the first test runner in Phase 1 and record it here.

**New web route (planned):**
- Komga-compatible and OPDS routes belong in the web process only.
- Image bytes are never served from the web process. It reads the staging manifest.

**Utilities:**
- Probe helpers: currently `probes/phase-0/host.mjs` (`withTimeout`, `loadExtension`).
  Add shared helpers there, or create `probes/phase-0/lib/` when a second shared file exists.

## Special Directories

**`probes/phase-0/bundles/`:**
- Purpose: cached extension bundles fetched from registries.
- Generated: yes, by `fetch-chapters.mjs`.
- Committed: no (gitignored). Never redistribute: GPL-3.0 extension code.

**`probes/phase-0/fixtures/pages/` and `probes/phase-0/fixtures/pages-full/`:**
- Purpose: page images for pHash experiments.
- Generated: yes, by `fetch-pages.mjs` and `fetch-pages-all.mjs`.
- Committed: no (gitignored). Copyrighted images.

**`probes/phase-0/fixtures/chapters/`:**
- Purpose: chapter list regression corpus.
- Generated: yes, by `fetch-chapters.mjs`.
- Committed: yes.

**`probes/phase-0/results/`:**
- Purpose: sweep and analysis outputs.
- Generated: yes.
- Committed: yes, except `*.log` files (gitignored).

**`probes/phase-0/node_modules/`:**
- Generated: yes, by `npm install`. Patch
  `probes/phase-0/patches/runtime-polyfills-interceptor-chain.patch` is applied by hand afterward.
- Committed: no.

**`.worktrees/`:**
- Purpose: git worktrees for each session (`AGENTS.md`). Git-ignored.
- Committed: no.

---

*Structure analysis: 2026-11-02*
