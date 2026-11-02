---
last_mapped_commit: 035a59a331061875257f45c83895c44d3cd9aad7
last_mapped_at: 2026-11-02
---
# Codebase Concerns

**Analysis Date:** 2026-11-02

Scope: the whole tracked repository. The only code is the Phase 0 probe set under `probes/phase-0/`. No application code exists yet. Items marked "Phase 1" describe risks that apply once the product code is written. Items marked "probe" apply to the measurement scripts only. Git-ignored folders (`probes/phase-0/bundles/`, `probes/phase-0/fixtures/pages/`, `probes/phase-0/fixtures/pages-full/`) are not present in this checkout and were not analysed.

Severity key: **High** = blocks a Phase 1 decision or breaks a hard rule in `AGENTS.md`. **Medium** = wrong or unverifiable measurement, or a real operational risk. **Low** = hygiene.

## Tech Debt

**Polyfill patch is applied by hand, not by the build (High):**
- Issue: The interceptor-chain fix exists only as a patch file. The probe README says to apply it manually to `node_modules`. Nothing applies it automatically.
- Files: `probes/phase-0/patches/runtime-polyfills-interceptor-chain.patch`, `probes/phase-0/README.md`, `probes/phase-0/package.json`
- Impact: `AGENTS.md` requires `npm ci` in every new worktree. That command rebuilds `node_modules` and silently removes the fix. Results from extensions with two or more interceptors (rate limiter plus cookie store) then become invalid again.
- Fix approach: Apply the patch with a `postinstall` step or `patch-package`. Add a check that fails when the patched line is absent. The check should read `lib/RequestManager.js` and assert `requestInterceptor(finalRequest)`.

**Second polyfill bug has no patch (Medium):**
- Issue: `AGENTS.md` lists two polyfill bugs and says both are patched in `probes/phase-0/patches/`. Only the interceptor-chain bug has a patch. The `formDidChange` gap is covered by a stub that lives in the probe host.
- Files: `probes/phase-0/host.mjs` (the `formDidChange() {}` stub in `loadExtension`), `probes/phase-0/patches/`, `AGENTS.md`
- Impact: Any host that does not copy the stub crashes on sources with settings forms. The decision record says to fix the polyfills "on day one". That has not happened.
- Fix approach: Add a second patch file, or change the `AGENTS.md` line so it names the stub as the current fix.

**Dead and misdeclared package metadata (Low):**
- Issue: `probes/phase-0/package.json` declares `@paperback/types`, which no script imports. `"private": "true"` is a string, not a boolean. `"main": "index.js"` points to a file that does not exist. `"license": "ISC"` conflicts with the root `LICENSE` (AGPL-3.0). `"test"` is a placeholder that exits with status 1. No `engines` field is set.
- Files: `probes/phase-0/package.json`, `LICENSE`, `README.md`
- Fix approach: Remove the unused dependency. Set `"private": true`. Set `"license"` to match the root. Add `engines` for the Node LTS line that `AGENTS.md` requires.

**Matching logic is repeated across scripts (Low):**
- Issue: `fetch-chapters.mjs`, `fetch-pages.mjs` and `fetch-pages-all.mjs` each repeat search, title normalisation and bundle loading. Each script matches titles differently. `fetch-chapters.mjs` uses a scored `pickMatch`. `fetch-pages.mjs` and `fetch-pages-all.mjs` accept exact or prefix matches only.
- Files: `probes/phase-0/fetch-chapters.mjs`, `probes/phase-0/fetch-pages.mjs`, `probes/phase-0/fetch-pages-all.mjs`
- Impact: The same work can match a different manga ID in different steps. This is the identity drift that `probes/phase-0/README.md` describes.
- Fix approach: Move the matcher into one shared module before porting any of this logic.

## Known Bugs

**Witness parsers return wrong chapter numbers beyond the documented case (High, measurement):**
- Symptoms: `chapNum` does not match the chapter in the title for several witnesses. The README documents only MangaFox volume-as-chapter.
- Files: `probes/phase-0/fixtures/chapters/berserk--MangaPill.json`, `probes/phase-0/fixtures/chapters/tower-of-god--MangaFox.json`, `probes/phase-0/fixtures/chapters/one-piece--MangaFox.json`
- Trigger: Run `analyze-drift.mjs` on the committed fixtures. In `berserk--MangaPill.json`, 389 of 404 chapters have `chapNum` 2. Their titles read "Group 2 Chapter N". In `tower-of-god--MangaFox.json`, 338 chapters have `chapNum` 2 and 136 have `chapNum` 1. In `one-piece--MangaFox.json`, titles such as "Vol.85 Ch.858" carry `chapNum` 85. A rough title scan counts 860 of 1,226 chapters in that file where the chapter in the title and `chapNum` differ.
- Workaround: None in code. The drift report includes these witnesses. `results/drift-report.json` gives `berserk` MangaPill only 16 unique numbers.
- Impact: The 14.4% raw drift and the per-work figures are inflated or distorted by parser defects. Their true value is unknown until these witnesses are excluded or repaired.

**MangaPill publish dates are a 1970 placeholder (Medium):**
- Symptoms: Every chapter in every `*--MangaPill.json` fixture has `publishDate` `1970-01-01T00:00:00.000Z`. That is 7,787 chapters across seven works.
- Files: `probes/phase-0/fixtures/chapters/*--MangaPill.json`, `probes/phase-0/fetch-chapters.mjs` (the `publishDate` line writes the epoch as a real date)
- Trigger: Any use of `publishDate` for ordering or deduplication.
- Fix approach: Treat epoch values as "unknown". Store `null` and keep the raw value out of ordering logic.

**Failure classifier hides host-side errors (Medium):**
- Symptoms: Some errors that point at the host or at the runtime are counted as extension or source failures. Examples are `ext.getSearchResults is not a function`, `(e || "").toLowerCase is not a function`, and `Cannot read properties of undefined`. `classifyError` maps "Cannot read" and "undefined is not" to `PARSER_CHANGED`. Sources that need a login are counted as `EXTENSION_CRASH@pages`, for example "Log in via WebView" and "You are currently logged out".
- Files: `probes/phase-0/host.mjs` (`classifyError`), `probes/phase-0/results/sweep418.jsonl`
- Impact: `docs/decisions/0001-acquisition-make-or-buy.md` says "zero failures for a missing host ABI". The classifier cannot support that claim. A host contract error can be counted as a source problem, and a parser change can be counted as a host crash.
- Fix approach: Add `NEEDS_AUTH` and `HOST_CONTRACT` classes. Review the two host-side messages by hand. Remove "Cannot read" and "undefined is not" from the `PARSER_CHANGED` pattern.

**Child process timeout is shorter than the stage budget (Medium):**
- Symptoms: The parent kills a child after 180 s. A full chain can use more time than that. Stage limits are 20 s for `initialise`, 45 s for each search, and 45 s for each later stage. A slow but progressing source can therefore be killed and recorded as `TIMEOUT` even though no single stage failed.
- Files: `probes/phase-0/sweep418.mjs` (`timeout: 180_000`), `probes/phase-0/host.mjs` (`STAGE_TIMEOUT_MS`, `withTimeout`)
- Impact: The single recorded `TIMEOUT` in `results/sweep418.jsonl` may be a child kill and not a stage timeout. The sweep cannot tell the two apart.
- Fix approach: Derive the child timeout from the stage budget. Record which stage was active when a child is killed.

**Sweep resume breaks on a partial last line (Low):**
- Symptoms: On restart, `sweep418.mjs` calls `JSON.parse` on every line of `results/sweep418.jsonl`. A line cut short by a crash throws and stops the run.
- Files: `probes/phase-0/sweep418.mjs` (the `done` set construction)
- Fix approach: Skip lines that fail to parse, or write to a temp file and rename it on completion.

**Child result read from stdout (Low):**
- Symptoms: The parent takes the last line of child stdout as the result. The extension `console` is passed through to the same stdout. `runner-child.mjs` calls `process.exit(0)` right after `console.log`.
- Files: `probes/phase-0/sweep418.mjs` (`out.trim().split('\n').pop()`), `probes/phase-0/runner-child.mjs`, `probes/phase-0/host.mjs` (`console` in the context)
- Impact: Extension output or truncated output can be read as the result. A crash can be recorded as `PROCESS_CRASH` with a misleading reason.
- Fix approach: Send the result through the IPC channel that `fork` already provides. Keep stdout for logs only.

**Success figure is a manual merge (Medium):**
- Symptoms: `results/sweep418.jsonl` records 221 passes. `probes/phase-0/README.md` and `docs/decisions/0001-acquisition-make-or-buy.md` report 222. The extra pass is `MangaKatana`, from `results/retry-empty.jsonl`. No script in the repo merges the two files. `sweep418.mjs` never passes the real-title queries that `runner-child.mjs` accepts. The retry path is therefore not in the repo.
- Files: `probes/phase-0/results/sweep418.jsonl`, `probes/phase-0/results/retry-empty.jsonl`, `probes/phase-0/results/empty-search-ids.txt`, `probes/phase-0/runner-child.mjs`, `probes/phase-0/sweep418.mjs`
- Impact: The headline 53.1% cannot be reproduced from committed code alone.
- Fix approach: Add a `--queries` option to `sweep418.mjs`. Add a merge step that writes the final table. Commit the merged output.

**Drift headline cannot be reproduced (High, measurement):**
- Symptoms: `probes/phase-0/README.md` reports 10.4% drift "after excluding two defective witnesses". `analyze-drift.mjs` has no exclusion logic. The two witnesses are not named in the script, the fixtures, or the README. Running the committed script on a copy of the fixtures gives 19,663 of 136,274 pair-chapters (14.4%), which matches the raw figure.
- Files: `probes/phase-0/analyze-drift.mjs`, `probes/phase-0/README.md`, `probes/phase-0/results/drift-report.json`
- Fix approach: Put the exclusion list in a named config file. Name the witnesses and the reason for each. Report both numbers.

**Drift classifier labels are incomplete (Low):**
- Symptoms: Every whole-number miss is labelled `offset`, and the code says this is "provisional". `flavours.other` is declared and never incremented. The shift detection that the comment describes is run, but its result is not used to re-label misses. The 16% whole-number figure therefore reflects the labelling rule, not a measurement.
- Files: `probes/phase-0/analyze-drift.mjs` (`flavours`, `offsetShift`)
- Fix approach: Use the shift result to label misses. Remove the unused `other` key or give it a rule.

**MangaFreak letter suffixes become fractions by a hidden rule (Low):**
- Symptoms: `Chapter 526a` becomes 526.1. `Chapter 179f` becomes 179.6. `Chapter 99e` becomes 99.5. The conversion happens in the source extension output, not in the repo. The drift analysis then counts these as split or interstitial drift.
- Files: `probes/phase-0/fixtures/chapters/tales-of-demons--MangaFreak.json`, `probes/phase-0/fixtures/chapters/solo-leveling--MangaFreak.json`, `probes/phase-0/analyze-drift.mjs`
- Fix approach: Record the suffix as a label in the raw data. Make the number mapping an explicit, tested rule.

## Security Considerations

**The probe host is not a sandbox (High):**
- Risk: `host.mjs` runs extension bundles in `node:vm` with host objects in scope. These include `Buffer`, `URL`, `Headers`, `FormData`, `crypto` and `console`. Host-realm constructors can reach the host `process` object. A bundle therefore has the privileges of the user running the probe. The comment in `host.mjs` says "node:vm is fine here". `AGENTS.md` says `node:vm` is not a security boundary and extensions must run with no database and no filesystem.
- Files: `probes/phase-0/host.mjs` (`vm.createContext`, the context object), `AGENTS.md` (Hard rules)
- Current mitigation: The probe is run by hand on a development machine. The `bundles/` folder is git-ignored.
- Recommendations: Do not copy the `host.mjs` context into Phase 1. Run extensions in a separate process with no filesystem or database access. Route network calls through a host-owned fetch with an allowlist. Remove the "node:vm is fine" comment so it does not spread.

**Bundles are run without integrity checks (High):**
- Risk: `runner-child.mjs` downloads `${registry}/${sourceId}/index.js` and runs it. `fetch-chapters.mjs` caches the download in `bundles/` and never checks it again. Nothing pins a hash or a version. A compromised registry, or a changed file behind the same URL, runs in the context described above.
- Files: `probes/phase-0/runner-child.mjs`, `probes/phase-0/fetch-chapters.mjs` (`bundle()`), `probes/phase-0/fetch-pages.mjs`, `probes/phase-0/fetch-pages-all.mjs`, `probes/phase-0/sweep418.mjs`
- Current mitigation: HTTPS to `github.io` hosts only.
- Recommendations: Store a SHA-256 for each bundle with the source record. Refuse to run a bundle whose hash changed without a review step. Record provenance (registry URL, version, hash, fetch time). `AGENTS.md` requires provenance to be recorded.

**Remote URLs from extension output are fetched without limits (Medium):**
- Risk: `fetch-pages.mjs` and `fetch-pages-all.mjs` call `fetch(url)` on page URLs returned by untrusted code. There is no host allowlist, so a source can point the probe at local or internal addresses. There is no size cap, and `arrayBuffer()` loads each image whole into memory.
- Files: `probes/phase-0/fetch-pages.mjs`, `probes/phase-0/fetch-pages-all.mjs`
- Current mitigation: None.
- Recommendations: In Phase 1, allow only the source's own domains. Refuse private and loopback addresses. Stream to a staging file with a size limit. Check the content type before writing.

**Image bytes pass through the process that runs extensions (Medium, Phase 1):**
- Risk: The probe downloads images inside the process that runs extension code. `AGENTS.md` says image bytes never pass through the web process. The probe pattern cannot be ported unchanged.
- Files: `probes/phase-0/fetch-pages.mjs`, `probes/phase-0/fetch-pages-all.mjs`, `AGENTS.md` (Hard rules)
- Recommendations: Split image download into a worker that writes to staging and produces a manifest. The web process reads only the manifest.

**Missing `.env` ignore rule (Low):**
- Risk: `.gitignore` has no pattern for `.env*` or `*.pem`. No such files exist in the repo today. A later secret file could be committed by mistake.
- Files: `.gitignore`
- Recommendations: Add `.env*`, `*.pem`, `*.key` and `secrets/` before any Phase 1 config is added.

**No secrets found in committed data (Info):**
- A scan of `probes/phase-0/results/`, `probes/phase-0/fixtures/chapters/` and `probes/phase-0/works.json` found no tokens, cookies, signed URLs or keys. The only query string is a `utm_` tracking parameter in `results/sweep418.jsonl`.

## Performance Bottlenecks

**Naive DCT in the pHash probes (Medium, Phase 1 if ported):**
- Problem: `dct2d` computes a 32 × 32 transform with four nested loops and two `Math.cos` calls per inner iteration. That is about one million multiply-add steps per page, with cosine values recomputed each time.
- Files: `probes/phase-0/phash.mjs` (`dct2d`), `probes/phase-0/phash-aligned.mjs` (`dct2d`)
- Cause: Written for clarity in a probe, not for throughput.
- Improvement path: Use a separable DCT with a precomputed cosine table, or a tested image-hash library. Cache hashes per file.

**All-pairs page comparison (Medium, Phase 1 if ported):**
- Problem: `phash-aligned.mjs` compares every page of one source with every page of another, for every work and every source pair. Template detection also compares all pages across works.
- Files: `probes/phase-0/phash-aligned.mjs`
- Cause: Quadratic comparison over the full page sets.
- Improvement path: Compare only candidate pairs found by a coarse index. Cap pages per chapter for the first pass.

**Sweep wall time is untested (Low):**
- Problem: `sweep418.mjs` runs 8 children, each allowed up to 180 s. A full run over 418 sources can take hours. No run time is recorded.
- Files: `probes/phase-0/sweep418.mjs`
- Improvement path: Record run time per source in the result record. Measure the full run before any gate depends on it.

## Fragile Areas

**Single polyfill version with a manual patch:**
- Files: `probes/phase-0/package.json` (`"@paperback/runtime-polyfills": "^1.0.0-alpha.64"`), `probes/phase-0/package-lock.json` (resolves to `1.0.0-alpha.64`), `probes/phase-0/patches/runtime-polyfills-interceptor-chain.patch`
- Why fragile: The caret range is over a prerelease. An update can move to another alpha. The patch's context lines are not checked against any version, so a later alpha can make the patch fail silently or apply to the wrong line.
- Safe modification: Pin the exact version. Add the check described under Tech Debt. Record the version next to every result.
- Test coverage: None.

**Host stubs replace missing polyfill behaviour:**
- Files: `probes/phase-0/host.mjs` (the `Application` object and `formDidChange`)
- Why fragile: The stub is the only protection against the missing method. A source that calls another missing method fails with a generic error that the classifier may mislabel.
- Safe modification: Test every stub with a source that uses it. Log each call to a stub.
- Test coverage: None.

**Fixture refresh skips existing files:**
- Files: `probes/phase-0/fetch-chapters.mjs` (`fs.existsSync(out)` check), `probes/phase-0/fetch-pages.mjs`
- Why fragile: Running the script again never refreshes data. The drift and pass-rate figures describe a snapshot from 2026-08-13. Site availability changes daily, as `probes/phase-0/README.md` notes.
- Safe modification: Add a `--refresh` flag. Record the snapshot date in each result file, not only in the README.
- Test coverage: None.

**Two registries serve the same source IDs:**
- Files: `probes/phase-0/works.json` (WeebCentral and MangaDex use `inkdex.github.io`; the rest use `nicartjay.github.io`), `probes/phase-0/sweep418.mjs` (default `--registry` is `nicartjay.github.io`)
- Why fragile: The same source ID can come from two builds. A pass in the sweep may not match the build used for the fixtures.
- Safe modification: Record the registry with each result. Use one registry for each measurement and say which one.
- Test coverage: None.

**Probe results depend on live sites and on git-ignored data:**
- Files: `.gitignore` (`probes/phase-0/bundles/`, `probes/phase-0/fixtures/pages/`, `probes/phase-0/fixtures/pages-full/`)
- Why fragile: Only chapter metadata is committed. The page-level measurements for the pHash threshold cannot be re-run from the repo. The README states some results that depend on these files, including "9/54 byte-identical" and "WeebCentral ≡ MangaPill for two whole works". The numbers are not reproducible from the committed code.
- Safe modification: Commit a hash manifest of the page fixtures, or a script that rebuilds them with recorded hashes.

## Measurement Validity

**pHash threshold is tuned on the data it is reported on (High):**
- Issue: The README gives 121 same-content pairs and 2,896 different-content pairs. It chooses threshold 14. Both sets come from the same six works, and there is no held-out set.
- Files: `probes/phase-0/phash-aligned.mjs` (threshold scan), `probes/phase-0/README.md`, `AGENTS.md` ("Validated pHash threshold")
- Impact: The threshold is fitted to the same pairs it is scored on.

**Same-content label is circular (High):**
- Issue: `phash-aligned.mjs` labels a pair "same content" when the two pages are mutual nearest neighbours by the same pHash distance. The threshold is then scored against that label. The method cannot find a same-content pair that the hash itself misses.
- Files: `probes/phase-0/phash-aligned.mjs` (mutual nearest neighbour block)
- Impact: The "1 miss / 121" result measures agreement with the hash, not agreement with the true content.
- Fix approach: Label a sample by hand or by a source that carries the page's file identity. Score the threshold against those labels.

**Overlap between distributions is understated (High):**
- Issue: The README table gives same-content max 22 and different-content min 18. The ranges overlap between 18 and 22. The margin between threshold 14 and the closest different-content pair is 4 bits. `AGENTS.md` and `probes/phase-0/README.md` describe the separation as "clean".
- Files: `probes/phase-0/README.md` (pHash table), `AGENTS.md`
- Fix approach: State the overlap. Report the number of pairs in the overlap band. Use a second signal for pairs in that band.

**Hash length is misstated (Medium):**
- Issue: `phash.mjs` and `phash-aligned.mjs` remove the DC coefficient (`block.slice(1)`). The hash therefore has 63 bits, not 64. `AGENTS.md` says "64-bit hashes". The threshold of 14 is a distance on 63 bits.
- Files: `probes/phase-0/phash.mjs`, `probes/phase-0/phash-aligned.mjs`, `AGENTS.md`
- Fix approach: Correct the wording in `AGENTS.md` and the README, or change the hash to 64 bits and re-run the scan.

**"Byte-identical" is a heuristic (Medium):**
- Issue: `phash.mjs` marks two files as identical when their lengths match and their first 64 bytes match. This is not a byte comparison. Two different files with the same header and size are counted as identical.
- Files: `probes/phase-0/phash.mjs` (the `sha` field and the `identical` flag)
- Impact: The "9/54 byte-identical" figure and the claim that two aggregators serve identical files for whole works rest on this check.
- Fix approach: Compare full SHA-256 digests.

**Drift denominator and window rule are not stated (Low):**
- Issue: `analyzePair` skips a pair when either side has fewer than 10 numbers in the overlap window. That rule drops pairs silently. The README does not give the number of pairs dropped.
- Files: `probes/phase-0/analyze-drift.mjs` (`analyzePair`)
- Fix approach: Report the number of skipped pairs in the output.

## Dependencies at Risk

**`@paperback/runtime-polyfills` (Medium):**
- Risk: The package is a prerelease alpha that has no fix for two bugs in its own code. The fixes live in a manual patch and in a stub.
- Impact: Every extension result depends on this host layer. A change in the package changes the measured pass rate.
- Migration plan: Decide between a fork that carries the fixes and a pinned version with a patch step. Record the choice in `docs/decisions/`.

**`sharp` native binary (Low):**
- Risk: `sharp` ships native binaries. Install results differ by platform and by Node version.
- Impact: The pHash probes fail to install on some machines. This does not affect the product yet.
- Migration plan: Pin the version. Test the install on the LTS line that `AGENTS.md` requires.

**Probe runtime is not the LTS line (Low):**
- Risk: The Phase 0 probes ran on Node 26 on 2026-08-13. Node 26 entered Active LTS on 2026-10-28. The probe results were produced on the line that was current at that date.
- Impact: The phase gate for pass rate and drift may need to be measured again on the LTS line before Phase 1 relies on it.
- Migration plan: Re-run `sweep418.mjs` on the LTS line and record the Node version in the results.

## Missing Critical Features

**No provenance store for sources (High, Phase 1):**
- Problem: `AGENTS.md` requires that every user-added source records its provenance. The probes store no provenance. A bundle is identified only by its source ID and the registry it came from.
- Blocks: Auditing which code ran for a given result. Reverting a source. The license posture that `AGENTS.md` depends on.

**No staging and atomic rename path (High, Phase 1):**
- Problem: `AGENTS.md` requires staging and atomic rename. The probes write final fixture files directly, for example `fetch-pages.mjs` writes to its final path.
- Blocks: Safe library writes. Rescans by Kavita or Komga during a write.

**No read-only import rule (High, Phase 1):**
- Problem: `AGENTS.md` says the import mount is read-only and that no import is reported done while anything is unresolved. Neither rule has code.
- Blocks: The import feature.

**No automated pass-rate measurement (Medium):**
- Problem: `docs/decisions/0001-acquisition-make-or-buy.md` sets a switching trigger at pass rate below 60% for a month after the solver ships. No scheduled job, metric, or stored history exists to test this.
- Blocks: The decision trigger. The trigger cannot fire without a measurement.

**Upstream or fork fix for the polyfills (Medium):**
- Problem: The decision record says to fix or upstream the two polyfill bugs on day one. Neither is done.
- Blocks: Trusting results from any host other than the probe host.

## Test Coverage Gaps

**No tests in the repository (High):**
- What's not tested: The whole probe set. `probes/phase-0/package.json` has a placeholder `test` script that exits with an error. Nothing checks the classifier, the matcher, the hash functions, or the drift rules.
- Files: `probes/phase-0/package.json`, `probes/phase-0/host.mjs` (`classifyError`), `probes/phase-0/fetch-chapters.mjs` (`pickMatch`), `probes/phase-0/phash.mjs`, `probes/phase-0/analyze-drift.mjs` (`analyzePair`)
- Risk: Classifier and matcher errors change the headline numbers without any signal. The two defects found in this review (the classifier and the MangaPill chapter numbers) both went unnoticed.
- Priority: High

**No tests for the hash comparison (High):**
- What's not tested: DCT correctness, the mutual nearest neighbour rule, template exclusion, and the threshold scan.
- Files: `probes/phase-0/phash.mjs`, `probes/phase-0/phash-aligned.mjs`
- Risk: A wrong transform still produces a plausible-looking distribution.
- Priority: High

**No tests for the polyfill patch (Medium):**
- What's not tested: Whether the patched line exists in the installed polyfill version.
- Files: `probes/phase-0/patches/runtime-polyfills-interceptor-chain.patch`
- Risk: See Tech Debt. The fix can disappear after `npm ci`.
- Priority: High

**No CI and no lint or type checks (Medium, Phase 1):**
- What's not tested: Everything. No CI config, formatter, linter or type checker exists in the repo.
- Files: repository root
- Risk: Phase 1 code starts without any gate.
- Priority: Medium

---

*Concerns audit: 2026-11-02*
