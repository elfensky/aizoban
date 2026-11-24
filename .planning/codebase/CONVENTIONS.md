---
last_mapped_commit: 035a59a331061875257f45c83895c44d3cd9aad7
last_mapped_at: 2026-11-02
---
# Coding Conventions

**Analysis Date:** 2026-11-02

## Scope of Current Code

The repo has no application code. The only code is the Phase 0 probe scripts in `probes/phase-0/`. All conventions below come from those scripts. They describe probe code. They do not describe product code. The product stack is set in `AGENTS.md`: Next.js, TypeScript, Postgres, `pg-boss`. No TypeScript, lint or format config exists yet. When Phase 1 adds product code, the conventions in this file must be re-derived.

## Language and Module System

- All code is JavaScript ES modules with the `.mjs` extension: `probes/phase-0/*.mjs`.
- `probes/phase-0/package.json` sets `"type": "module"`. Keep this setting for any Node code in the probe tree.
- Relative imports always include the file extension: `import { loadExtension } from './host.mjs'` in `probes/phase-0/fetch-chapters.mjs`.
- Node built-ins use the `node:` prefix: `node:fs`, `node:path`, `node:url`, `node:vm`, `node:child_process`.
- Import order: Node built-ins first, then third-party packages, then local modules. See `probes/phase-0/host.mjs` and `probes/phase-0/phash.mjs`.

## Naming Patterns

**Files:**
- Kebab-case, lower case: `fetch-pages-all.mjs`, `phash-aligned.mjs`, `runner-child.mjs`.
- Role-based suffixes are used for helpers that run in a child process: `runner-child.mjs`.
- Probe scripts are named after their task. Numbered probe issues appear in the header comment, for example `// aizoban#2`.

**Functions:**
- camelCase: `loadExtension`, `runChain`, `classifyError`, `withTimeout`, `pickMatch`, `dct2d`, `hashes`, `ham`.
- Short helper names are used for tiny pure helpers: `norm`, `ham`, `arg`, `c`. Longer names are used for exported functions.
- Exported helpers come from `probes/phase-0/host.mjs` and are shared by other scripts.

**Variables:**
- `const` by default. `let` only when the value changes (`let stage = 'search'` in `runChain`).
- camelCase for locals: `searchHits`, `chapterDetails`, `sourceManga`.
- Abbreviations are common: `ext` (extension), `cfg` (config), `cd` (chapter details), `sm` (source manga), `buf` (buffer), `t` (target), `dflt` (default).

**Constants:**
- UPPER_SNAKE_CASE for module-level tunables and paths: `STAGE_TIMEOUT_MS`, `CONCURRENCY`, `RESULTS`, `FIXTURES`, `BUNDLES`, `ONLY_WORK`, `ONLY_SOURCE`.
- Mixed-case constants also appear. `DIR`, `OUT`, `PAGES`, `REFERER`, `TARGETS`, `REGISTRY` are upper case. `REG_NICART` and `REG_INKDEX` are upper case with a prefix.
- Numeric literals use underscore separators for milliseconds: `45_000`, `30_000`, `180_000`.

**Types:**
- No type system. No JSDoc type annotations appear in the probes.

## Code Style

**Formatting:**
- No formatter config exists. No `.prettierrc`, no `biome.json`, no `.editorconfig`.
- Observed style, applied by hand:
  - 2-space indentation.
  - Single quotes for strings. Some files use double quotes, for example `queriesArg.split(",")` in `probes/phase-0/runner-child.mjs` and `typeof source === "undefined"` in `probes/phase-0/host.mjs`. New code uses single quotes.
  - Semicolons are mostly omitted. `probes/phase-0/host.mjs`, `probes/phase-0/fetch-chapters.mjs`, and `probes/phase-0/analyze-drift.mjs` contain no semicolons. Keep one style within a file.
  - Trailing commas are used in multi-line object and array literals.
  - Dense one-line helpers are accepted when the body is short. Example: the `dct2d` loops in `probes/phase-0/phash.mjs`.

**Linting:**
- Not configured. No ESLint, no Biome, no `eslint.config.*`.

## Import Organization

**Order:**
1. Node built-ins with `node:` prefix (`import fs from 'node:fs'`).
2. Third-party packages (`import sharp from 'sharp'`, `import { ApplicationPolyfill } from '@paperback/runtime-polyfills'`).
3. Local modules with relative paths (`import { loadExtension, runChain } from './host.mjs'`).

**Path resolution:**
- Resolve local data paths from the script location. Never use `process.cwd()`. The pattern is:
  ```js
  const DIR = path.dirname(fileURLToPath(import.meta.url))
  const FIXTURES = path.join(DIR, 'fixtures', 'chapters')
  ```
  This pattern appears in `probes/phase-0/fetch-chapters.mjs`, `probes/phase-0/analyze-drift.mjs`, `probes/phase-0/sweep418.mjs`, and `probes/phase-0/phash.mjs`.

**Path Aliases:**
- None. No `paths` in a tsconfig exists yet.

## Error Handling

**Pattern 1: Structured result records (preferred for probes that run many sources).**
Errors do not escape. The function returns a record with `ok`, the furthest `stage` reached, a `class`, and a truncated `error` message. See `runChain` in `probes/phase-0/host.mjs`:
```js
} catch (err) {
  return { stage, ok: false, class: classifyError(err, stage),
           error: String(err?.message ?? err).slice(0, 300), ...out }
}
```

**Pattern 2: Error classification by regex.**
`classifyError` in `probes/phase-0/host.mjs` maps an error message to a named class. Known classes: `NOT_IMPLEMENTED_WEBVIEW`, `CLOUDFLARE_CHALLENGE`, `TIMEOUT`, `EVAL_ERROR`, `NETWORK`, `PARSER_CHANGED`, and `EXTENSION_CRASH@<stage>`. Add new classes to this function. Do not add ad hoc strings elsewhere.

**Pattern 3: Per-item try/catch in loops.**
A failure for one (work, source) pair does not stop the loop. The loop logs a `FAIL` line and continues. See `probes/phase-0/fetch-chapters.mjs` and `probes/phase-0/fetch-pages-all.mjs`.

**Pattern 4: Timeouts wrap every remote call.**
Use `withTimeout(promise, ms, label)` from `probes/phase-0/host.mjs`. It rejects with a message that starts with `TIMEOUT:`. The classifier depends on that prefix.
```js
const details = await withTimeout(ext.getMangaDetails(manga.mangaId), STAGE_TIMEOUT_MS, 'details')
```

**Pattern 5: Process isolation for untrusted code.**
`probes/phase-0/sweep418.mjs` runs each source in a child process with `fork` and a 180-second `timeout`. A crash or hang becomes a `PROCESS_CRASH` or `TIMEOUT` record. The child writes exactly one JSON line to stdout. The parent parses the last line. Keep stdout reserved for this JSON line in child processes.

**Pattern 6: Skip-with-log for unavailable sources.**
Failures to load an extension print `SKIP source <id>: <message>` and continue. See `probes/phase-0/fetch-chapters.mjs`.

**Rule for product code (from `AGENTS.md`):** Never report an import as done while anything is unresolved. Error records must stay visible. Do not swallow them.

## Logging

**Framework:** `console` only. No logging library.

**Channels:**
- `console.error` for progress and diagnostics. Lines use a fixed status prefix: `OK`, `FAIL`, `MISS`, `NOCH`, `NOPAGES`, `IMG`, `SKIP`, `have`, `done`, `DONE`. See `probes/phase-0/fetch-pages.mjs` and `probes/phase-0/sweep418.mjs`.
- `console.log` for machine-readable output: one JSON line per record (`probes/phase-0/runner-child.mjs`, the final report lines of `probes/phase-0/analyze-drift.mjs`).

**Patterns:**
- Include the work key, the source id, and the stage in each line: `OK ${t.key}-ch${t.ch} × ${sourceId} ${tag}`.
- Truncate long error text before logging: `.slice(0, 160)` or `.slice(0, 300)`.

## Comments

**When to Comment:**
- Comment the reason for a decision that the code cannot show. Examples from the probes:
  - `// contains-only matches produced impostors` in `probes/phase-0/fetch-chapters.mjs`.
  - `// newest chapter is chapters[0] by convention; take the last ... more likely stable/complete on the site` in `probes/phase-0/host.mjs`.
  - `// node:vm is fine here — these are measurement scripts, not the product.` in `probes/phase-0/host.mjs`.
- Each script starts with a header comment: a `// aizoban#<n> — <purpose>` line, and a usage line for scripts that take arguments.

**Known limits:**
- The `node:vm` comment means the probe host is not a security boundary. The `AGENTS.md` hard rule states that extensions are untrusted and `node:vm` is not a security boundary. Product code must use a separate sandboxed process. Do not copy `host.mjs` into product code.

**JSDoc/TSDoc:**
- Not used.

## Function Design

**Size:** Most functions stay under 30 lines. `runChain` in `probes/phase-0/host.mjs` is the longest function at about 50 lines. It is a stage pipeline, and each stage sets `stage` before its call.

**Parameters:**
- Options objects with defaults for optional arguments: `runChain(ext, { queries = ['a', 'love'], mangaId = null } = {})`.
- Positional arguments for required values.
- Unused positional `undefined` placeholders appear in calls to `getSearchResults(query, undefined, undefined)`. This matches the Paperback extension API. Keep it.

**Return Values:**
- Return plain objects with a fixed key set. Stage-pipeline functions return `{ stage, ok, ... }`.
- Return `null` for "not found" in matchers: `pickMatch` in `probes/phase-0/fetch-chapters.mjs`.

**CLI arguments:**
- Hand-rolled. Pattern from `probes/phase-0/sweep418.mjs`:
  ```js
  const arg = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
  ```
- Do not add a CLI library for the probes.

## Module Design

**Exports:**
- Named exports only. `probes/phase-0/host.mjs` exports `withTimeout`, `loadExtension`, `runChain`, and `classifyError`.
- Scripts with a single entry point have no exports. They run top-level code.

**Barrel Files:** None.

**Shared logic:**
- Shared helpers live in `probes/phase-0/host.mjs`. Some helpers are copied instead. `norm` (title normalization) appears in `probes/phase-0/fetch-chapters.mjs`, `probes/phase-0/fetch-pages.mjs`, and `probes/phase-0/fetch-pages-all.mjs`. `getExt` and the `TARGETS` list are duplicated between the two page fetchers. New shared code should move to `host.mjs` or a new shared module. Do not add a fourth copy.

## Data Conventions

**Raw labels are kept:**
- Store source data as received. Parsed values go beside raw values. Example: `chapNum`, `title`, `volume`, and `sortingIndex` are all saved in `probes/phase-0/fixtures/chapters/*.json`.
- Parsing is testimony, not truth. This is required by `AGENTS.md` and `docs/decisions/0001-acquisition-make-or-buy.md`.

**Identifiers in file names:**
- Double dash `--` separates fields: `<work-key>--<source-id>.json` in `probes/phase-0/fixtures/chapters/`.
- Page images use `<work>-ch<N>--<source>--<tag>.img` in `probes/phase-0/fixtures/pages/`. `analyze-drift.mjs` parses this pattern with a regex. Changing the pattern requires changing the regex.

**Resumable writes:**
- Skip work when the output file exists: `if (fs.existsSync(out)) { ... continue }`.
- Append JSONL for long sweeps: `results.write(JSON.stringify(rec) + '\n')` in `probes/phase-0/sweep418.mjs`. On start, read existing ids and skip them.

**Output format:**
- JSON with 1-space indentation for fixtures: `JSON.stringify(x, null, 1)`.

## Configuration

- Data-driven config lives in JSON files. `probes/phase-0/works.json` lists works, aliases, and sources. The probe reads it at start: `JSON.parse(fs.readFileSync(path.join(DIR, 'works.json'), 'utf8'))`.
- Registry URLs are constants in the script that uses them. `REG_NICART` and `REG_INKDEX` in `probes/phase-0/fetch-pages-all.mjs`. `REGISTRY` default in `probes/phase-0/sweep418.mjs` can be overridden with `--registry`.
- Secrets: none in the probe code. Do not add credentials to probe code.

## Package Hygiene

`probes/phase-0/package.json` has known issues. Fix them in Phase 1:
- `"private": "true"` is a string. Use the boolean `true`.
- `"main": "index.js"` points to a file that does not exist.
- `"description"`, `"author"`, and `"keywords"` are empty.
- `"license": "ISC"` should match the repository `LICENSE` file.
- `"test"` script exits with an error. See `TESTING.md`.

## Rules Derived From `AGENTS.md`

These rules apply to all code in the repo. They are not style choices.
- Image bytes never pass through the web process. Workers write to staging with a manifest.
- Extensions are untrusted third-party code. Run them in a sandboxed process with no database and no filesystem.
- Never bundle extensions. Users add sources at runtime, with provenance recorded.
- Stage and atomically rename output files. Do not write final paths directly.
- YAML site definitions carry config, never selectors.

---

*Convention analysis: 2026-11-02*
