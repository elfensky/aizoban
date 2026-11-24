---
last_mapped_commit: 035a59a331061875257f45c83895c44d3cd9aad7
last_mapped_at: 2026-11-02
---
# Testing Patterns

**Analysis Date:** 2026-11-02

## Summary

No test framework exists. No test files exist. No CI exists. The only executable code is measurement probes in `probes/phase-0/`. They fetch live sites and print results. They do not assert expected values, and they set no failing exit codes.

## Current State

| Item | Status | Evidence |
|------|--------|----------|
| Test runner | Not configured | No `jest.config.*`, `vitest.config.*`, or `*.test.*` / `*.spec.*` files. |
| `npm test` | Fails by design | `probes/phase-0/package.json` `scripts.test` is `echo "Error: no test specified" && exit 1`. |
| Assertion library | Not configured | No `node:assert` usage in the repo. |
| Coverage | Not configured | No coverage config or tool. |
| Lint | Not configured | No ESLint, Biome, or `eslint.config.*`. |
| Format | Not configured | No Prettier, `.editorconfig`, or formatter config. |
| Type checking | Not configured | No `tsconfig.json`. No TypeScript sources yet. |
| Pre-commit hooks | Not configured | No `.husky/` directory. |
| CI | Not configured | No `.github/` directory. |
| Node version pin | Not configured | No `.nvmrc` or `.node-version`. The code uses global `fetch`, `Array.prototype.at`, and `structuredClone`, so it needs a modern Node. |
| Installed dependencies | Not present in worktree | `probes/phase-0/node_modules/` does not exist. Run `npm ci` in `probes/phase-0/` first. |

Do not assume a test runner. `AGENTS.md` names the Phase 1 stack (Next.js, TypeScript, Postgres, `pg-boss`). It does not name a test framework. Choose one in Phase 1 and record the choice in `docs/decisions/`.

## How the Probes Are Run

Each probe is a standalone Node script. Run from `probes/phase-0/` after `npm ci`:

```bash
cd probes/phase-0
npm ci                                   # install sharp and @paperback packages
node fetch-chapters.mjs                  # fetch chapter lists into fixtures/chapters/
node fetch-chapters.mjs --only berserk --source MangaPill   # one pair
node fetch-pages.mjs                     # fetch page images into fixtures/pages/ (git-ignored)
node fetch-pages-all.mjs                 # fetch every page of each chapter (git-ignored output)
node sweep418.mjs --concurrency 8        # run every registry source; appends results/sweep418.jsonl
node sweep418.mjs --only Id1,Id2         # subset run
node phash.mjs                           # pHash / dHash distance report on fixtures/pages/
node phash-aligned.mjs                   # content-aligned hash comparison
node analyze-drift.mjs                   # pHash separation report and threshold scan
```

Probes that use the network need internet access. Results depend on the live state of each source site. Re-running a probe can give different results. `fetch-chapters.mjs` and `sweep418.mjs` skip work that already has output, so re-runs are cheap. Delete the output file to force a fetch.

## Probe Output as the Measurement

The probe output is the test result. Treat it as evidence, not as pass or fail:

- `probes/phase-0/results/sweep418.jsonl`: one record per source. Fields include `id`, `ok`, `stage`, `class`, `chapters`, `pages`, `ms`.
- `probes/phase-0/results/retry-empty.jsonl`: retries for sources that returned `EMPTY_SEARCH`.
- `probes/phase-0/results/empty-search-ids.txt`: source ids that returned no search hits.
- `probes/phase-0/results/drift-report.json`: output of the drift analysis.
- `probes/phase-0/results/*.log` is git-ignored.

Error classes come from `classifyError` in `probes/phase-0/host.mjs`. A pass rate is the count of `ok: true` records. Read `probes/phase-0/README.md` for the recorded numbers and the decision they support.

## Fixtures

**Committed fixtures:**
- `probes/phase-0/fixtures/chapters/<work>--<source>.json`. About 60 files. Each file holds the raw chapter list for one work on one source, with `fetchedAt`. Keep the raw labels. See `CONVENTIONS.md`, "Data Conventions".
- `probes/phase-0/works.json`: work list, aliases, and source registry map. Input to `fetch-chapters.mjs`.

**Git-ignored fixtures (absent on a fresh clone):**
- `probes/phase-0/fixtures/pages/`: page images. Used by `phash.mjs`, `phash-aligned.mjs`, and `analyze-drift.mjs`.
- `probes/phase-0/fixtures/pages-full/`: full page sets. Used by `fetch-pages-all.mjs`.
- `probes/phase-0/bundles/`: cached extension bundles. Written by `fetch-chapters.mjs`.

**Gap:** `analyze-drift.mjs` calls `fs.readdirSync` on `fixtures/pages/` with no existence check. On a fresh clone it throws. Run `fetch-pages.mjs` first. Its output is not committed, so a second clone must re-fetch it.

**Fixture naming:** `<work>-ch<N>--<source>--<tag>.img`, where `<tag>` is `p1`, `pmid`, or `plast` for `fetch-pages.mjs`. `fetch-pages-all.mjs` uses a zero-padded page index instead. `analyze-drift.mjs` parses the `p1|pmid|plast` form only.

## Test Structure (for new tests)

No test exists yet. The pattern below is the target. It is not implemented.

For new non-trivial logic in probe code, add a self-check. Use `node:assert/strict` and a script that exits non-zero on failure. Put the file beside the code it checks, or under `probes/phase-0/test/` if a folder is needed. Name it `<module>.test.mjs`. Run it with `node --test` (built into Node) until a runner is chosen.

```js
// probes/phase-0/classify-error.test.mjs (target pattern, not present)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyError } from './host.mjs'

test('timeout prefix maps to TIMEOUT', () => {
  assert.equal(classifyError(new Error('TIMEOUT: search exceeded 45000ms'), 'search'), 'TIMEOUT')
})
```

Importing `host.mjs` pulls in `@paperback/runtime-polyfills`. Install dependencies first.

**Pure functions to test first:**
- `classifyError` in `probes/phase-0/host.mjs`. Pure. Regex table. Easy to test.
- `norm` and `pickMatch` in `probes/phase-0/fetch-chapters.mjs`. Currently not exported. Move them to a shared module before testing.
- `ham` (Hamming distance) in `probes/phase-0/analyze-drift.mjs`. Currently not exported.
- The `chapNum` match in `fetch-pages-all.mjs` (`Math.abs(Number(c.chapNum) - t.ch) < 1e-9`). Use a float fixture such as `300.5`.

**Mocking:**
- No mocking library. The probes call live sites. There is no mock layer.
- For a future test of `runChain`, pass a fake `ext` object with `getSearchResults`, `getMangaDetails`, `getChapters`, and `getChapterDetails` methods. `runChain` only uses these four methods. Each stage sets `stage` before its call, so a test can make one method throw and check the returned `stage` and `class`.

**What to mock:** The four extension methods. Network `fetch`.

**What not to mock:** `classifyError` and `withTimeout`. They are pure enough to call directly.

## Fixtures and Factories

- No factory helpers exist.
- Use the committed chapter JSON in `probes/phase-0/fixtures/chapters/` as real input for pure logic. It holds real raw labels. A `chapNum` of `0` or `300.5` appears in these files. Use real files for regression cases.

## Coverage

**Requirements:** None enforced. No coverage tool is configured.

**View Coverage:** Not available. Add a tool with the Phase 1 test runner.

## Test Types

**Unit tests:** None.

**Integration tests:** None in the test sense. The probes are live integration runs against external sites. They are the closest equivalent. Their output is kept in `probes/phase-0/results/`.

**E2E tests:** Not used.

**Phase 0 decision evidence:** The thresholds and pass rates in `probes/phase-0/README.md` and `docs/decisions/0001-acquisition-make-or-buy.md` came from these runs. Do not change a threshold without a new run. `AGENTS.md` says the Phase 0 numbers are measured facts. Re-check them with new data before changing a decision.

## Known Gaps

- No assertions in any probe. A probe succeeds if it runs to the end. It does not check its own results.
- `probes/phase-0/package.json` `test` script exits with an error. A CI job that runs `npm test` fails now.
- No exit code signals a failed measurement. `sweep418.mjs` always exits 0 after it finishes. `runner-child.mjs` calls `process.exit(0)` even after an error, and reports the error in JSON.
- `sweep418.mjs` reads `versioning.json` with no error handling. A registry outage stops the run before any record is written.
- Probe code uses live network calls. Results change over time. Two runs of the same probe can disagree. Record the run date with each result. The `fetchedAt` field in chapter fixtures does this.
- Duplicated helpers across probes (`norm`, `getExt`, target lists). A shared test would not reach them until they are moved to a shared module.

## Recommended Order for Phase 1

1. Choose a test runner. Record the choice in `docs/decisions/`.
2. Add a `test` script that runs real checks and exits non-zero on failure.
3. Add a CI workflow that runs install, type check, lint, and test. Pin the Node version in `.nvmrc`.
4. Add a unit test for each pure function listed above before the logic is reused.
5. Keep live network probes out of the default test run. Put them behind a separate script, such as `npm run probe`.

---

*Testing analysis: 2026-11-02*
