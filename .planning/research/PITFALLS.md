# Pitfalls Research

**Domain:** self-hosted manga acquisition / library / metadata manager (Paperback 0.9 extension host, CBZ + ComicInfo.xml library, Komga-compatible API + OPDS-PSE, cross-source chapter reconciliation and page verification)
**Researched:** 2026-11-02
**Confidence:** MEDIUM overall. Phase 0 facts, the Phase 0 audit (`.planning/codebase/CONCERNS.md`), and the cited primary sources are HIGH. Behaviour of Kavita, Komga, Mihon and Paperback clients is MEDIUM or LOW where marked: no running instance was tested in this session.

**Tags used below:** `[V]` = read in a primary source this session. `[P0]` = measured in Phase 0 or found in the Phase 0 audit. `[K]` = prior knowledge, not re-verified. Treat `[K]` items as hypotheses to test in the phase named.

**Phases:** 1 skeleton, 2 recipes, 3 library, 4 census, 5 assay, 6 readers, 7 scale, 8 polish.

---

## Roadmap flags (read first)

Four findings change the roadmap. They are expanded in the pitfalls below.

1. **Sandboxing is scheduled too late.** The roadmap puts "real sandboxing" in Phase 8. Phase 1 already runs untrusted extension code. Phase 1 must ship the process boundary, the no-credentials rule and the host-owned network layer. Phase 8 may only add hardening on top (Pitfall 6).
2. **"Image bytes never pass through the web process" conflicts with Phase 6.** Komga page endpoints and OPDS-PSE stream page images from CBZ files. Either the rule is narrowed to acquisition bytes, or a separate media process serves pages (Pitfall 11).
3. **The pass-rate switching trigger has no measurement.** Decision 0001 fires on "reachable pass rate < 60% for a month". Nothing records that history. Start a canary job in Phase 2, not Phase 7 (Pitfall 15).
4. **A quarantine queue with no review tool is a dead pile.** Phase 5 quarantines chapters on disagreement. "No reader" still needs a side-by-side page viewer for the human who resolves a quarantine (Pitfall 9).

---

## Critical Pitfalls

### Pitfall 1: Chapter identity keyed on chapter number

**What goes wrong:** The Slot (canonical chapter) is matched to Witness chapters by parsed number. Renumbered witnesses (per-season numbering, "S1/S2/S3 - Chapter N") align numerically while pointing at different chapters. The library silently holds the wrong chapter under the right number. Fractional chapters (84% of Phase 0 misses) and offsets (16%) create phantom "missing" chapters or false duplicates. [P0]

**Why it happens:** TV has an authoritative episode list, so number matching works there. Manga has none. Number agreement looks like confirmation, so it never raises an error.

**How to avoid:**
- Slot identity is an opaque id. A number is an attribute of a Fill, never its key.
- A Witness claim "chapter X = Slot S" is a claim with evidence and a state (`proposed`, `corroborated`, `disputed`). Number agreement alone gives `proposed`. Only content evidence (page count within tolerance, content-aligned page hashes, or an independent ordering signal) gives `corroborated`.
- Store numbers as a sortable tuple, not a float: `(major int, minor decimal text, suffix text)` plus the raw label. `12.5`, `12.50`, `12a` and `Extra` must not collide or sort by float rounding.
- Handle explicit non-numeric slots: prologue / chapter 0, omake, extras, oneshots, volume-only specials, combined releases ("12-13"), negative numbers.
- Seed the matcher test suite from `probes/phase-0/fixtures/chapters/` (committed). Add the Tower of God per-season case as a named regression.

**Warning signs:** a Slot has Fills whose page counts differ by more than the stitched-webtoon guard allows; two witnesses disagree on the total chapter count by more than ~10%; "missing chapter" counts that change when a witness is added.

**Phase to address:** Phase 3 (schema: opaque Slot id, label + number tuple), Phase 4 (claims with evidence states), Phase 5 (content evidence upgrades claims).

---

### Pitfall 2: Linking a Work to the wrong series or edition

**What goes wrong:** Fuzzy title linking attaches impostors: wrong series ("Berserk of Gluttony"), spin-off ("Jujutsu Kaisen 0"), novel ("Solo Leveling Novel"), or an unrelated title that shares a prefix. 9 of 70 (work, source) matches were wrong in Phase 0. MangaDex delists licensed series and retitles others (`【My Star】` for *Oshi no Ko*), so the right series is sometimes absent or under another name. [P0]

**Why it happens:** Identity is easier to automate than to verify. Wrong identity looks like ordinal drift downstream and is blamed on the Census.

**How to avoid:**
- Treat "this Witness is this Work" as a claim with its own evidence state, separate from chapter claims. Order: identity first, ordinal second.
- Never auto-link on title similarity alone. Auto-link only when a content check passes (first-chapter page hashes match an already-verified Work) or a human confirms. Show the candidate's cover, chapter count, alt titles and year next to the existing Work.
- Keep alt-title sets per Witness. Reject candidates whose chapter count or latest chapter differs by a large factor from the existing Witnesses.
- Allow "this source does not have this work" as a recorded negative, so the matcher does not retry the same wrong candidate on every refresh.

**Warning signs:** a new Witness's first chapter matches nothing in the existing Work; chapter counts differ by 10x; the same wrong candidate keeps reappearing in search results.

**Phase to address:** Phase 3 (Witness-to-Work link states), Phase 4 (identity check before Census reconciliation).

---

### Pitfall 3: Trusting witness parsers and treating their output as data

**What goes wrong:** Converted extensions return wrong numbers. MangaFox returns the volume as `chapNum`. MangaPill gives `chapNum` 2 for 389 of 404 Berserk chapters ("Group 2 Chapter N"). A title scan finds 860 of 1,226 One Piece MangaFox chapters where the title chapter and `chapNum` differ. MangaFreak letter suffixes become fractions by a hidden rule (`526a` becomes 526.1). MangaPill dates are all `1970-01-01`. [P0]

**Why it happens:** Each extension is third-party code written against a site that changes. The host cannot know which fields are reliable.

**How to avoid:**
- Persist the raw label verbatim beside every parsed number (already decided). Add a second parser inside Aizoban that parses the raw label itself. Compare it with the extension's `chapNum`. Disagreement lowers the Witness's trust and is recorded.
- Keep a per-Witness trust score and a named exclusion list (config file, with reason) instead of silently dropping witnesses from statistics.
- Treat epoch dates (`1970-01-01`) as unknown, stored as `null`. Never order or dedupe on `publishDate`.
- Make suffix-to-fraction mapping an explicit tested rule, and store the suffix.
- Add a "parser sanity" check at ingest: if more than N% of a Witness's chapters share one `chapNum`, flag the Witness as `parser_suspect`.

**Warning signs:** a Witness with few unique numbers across hundreds of chapters; raw label contains a number different from `chapNum`; all dates equal.

**Phase to address:** Phase 1 (schema stores raw label and null-able dates), Phase 4 (second parser, trust score, exclusion config).

---

### Pitfall 4: Counting correlated witnesses as independent testimony

**What goes wrong:** Aggregators serve byte-identical files (9/54 sample pairs; WeebCentral and MangaPill for two whole works). Two "agreeing" sources are really one upstream source. Verification passes because both copies carry the same defect: the same missing page, the same watermark, the same wrong chapter. [P0]

**Why it happens:** Agreement is counted by number of sources, not by independence of origin.

**How to avoid:**
- Compute a content-origin fingerprint per Fill (SHA-256 of each page, full file digest, not first-bytes). Fills with identical full digests form one origin cluster.
- The rule "nothing enters unverified when a second source exists" counts independent clusters. Byte-identical Fills give `corroborated-weak`, not `verified`.
- Record the cluster in the verification result, so a later independent source can upgrade or contradict it.
- Fix the Phase 0 "byte-identical" heuristic (length + first 64 bytes). Use full SHA-256.

**Warning signs:** a high share of chapters verified by pairs with page distance exactly 0; the same aggregators always agree with each other.

**Phase to address:** Phase 5.

---

### Pitfall 5: Treating the pHash threshold as validated

**What goes wrong:** The README calls separation "clean" at threshold 14, but the audit finds: same-content max is 22 and different-content min is 18, so the ranges overlap; the margin to the nearest false accept is 4 bits; the threshold was fitted and scored on the same six works; the "same content" label is itself defined by mutual nearest neighbour under the same hash (circular); the hash is 63 bits, not 64 (DC coefficient removed). A threshold tuned this way fails on a seventh work with different art style (flat colour pages, screentone-heavy pages, mostly white pages, text-only pages). [P0]

**Why it happens:** The probe was built to prove feasibility, and "0 false accepts / 2,896" reads as a result.

**How to avoid:**
- Before porting, build a labelled evaluation set with ground truth that does not come from the hash: hand-labelled pairs, or pairs where a source exposes a stable file id. Hold out whole works, not random pairs.
- Report the overlap band (18-22 bits) and send pairs in that band to a second signal: a second hash type (dHash or a different DCT block size), page dimensions ratio, or a coarse structural check.
- Pages that are low-entropy (blank, solid colour, near-white) have unstable pHash. Detect and exclude them, then require a larger share of the other pages to match.
- Version the threshold and hash algorithm in the data (`hash_algo`, `hash_bits`, `threshold`) so a change can re-evaluate stored hashes. Correct "64-bit" to "63-bit" in `AGENTS.md`, or change the hash.
- Keep the Phase 0 decision: do not re-litigate the approach without data. Re-litigate the claim "clean" with new data.

**Warning signs:** verification disputes cluster in one art style; many pairs fall in 12-22 bits; blank/near-white pages produce matches across unrelated works.

**Phase to address:** Phase 1 (pin hash spec and write unit tests for DCT / aligned match), Phase 5 (held-out evaluation, second signal, overlap handling).

---

### Pitfall 6: Sandbox that is not a sandbox

**What goes wrong:** Extensions run in `node:vm` with host objects in scope (`Buffer`, `URL`, `crypto`, `console`). Host constructors reach `process`, so the extension has the privileges of the user. The Node docs state the module "is not a security mechanism. Do not use it to run untrusted code." [V] Moving to a child process is necessary but not enough. The Node permission model gives no guarantee against malicious code, does not restrict the network, is not inherited by child processes or workers, and has documented bypasses (inspector via `process._debugProcess`, reuse of open file descriptors). [V via search summary of the Node permissions doc] A child process that inherits environment variables, a Postgres URL, or a mounted library can still read and exfiltrate them.

**Why it happens:** `node:vm` works well enough for the probe, and "process boundary" feels like the same thing as "sandbox".

**How to avoid (minimum for Phase 1, not Phase 8):**
- The worker container has no database credentials, no library mount, no import mount, and a scratch volume only. Pass a clean environment (`env: {}`) when forking the extension process.
- The extension process has no network of its own. All HTTP goes through a host-owned fetch over IPC. The host applies the allowlist (the source's own domains plus the registry), refuses private, loopback, link-local and metadata addresses (also after redirects and DNS resolution), caps response size, and sets the User-Agent.
- Image downloads come from the host layer, not from extension code, with the headers the extension's interceptors produce.
- Add OS-level isolation as a second layer: separate unprivileged uid, read-only root filesystem, dropped capabilities, `no-new-privileges`, memory and CPU limits, container egress policy that blocks the LAN.
- Use the Node permission flag only as an extra layer, never as the boundary.
- Remove the "node:vm is fine here" comment from `host.mjs` before any code is copied.
- Write one test extension that tries to read `/etc/passwd`, the environment, the network, and `process.binding`. The test must fail to see any of them. Run it in CI.

**Warning signs:** extension code reaches `process`, `require`, or `globalThis.constructor.constructor`; the worker container can resolve the database host name; extension process memory or CPU is unbounded.

**Phase to address:** Phase 1 (process boundary, clean env, host-owned fetch, container limits), Phase 8 (hardening, review of the escape test).

---

### Pitfall 7: Running unpinned, unverified extension bundles

**What goes wrong:** The probe downloads `${registry}/${sourceId}/index.js` and runs it. Nothing pins a hash or version. A compromised registry, or a changed file behind a URL, becomes code execution. An "update" button is a remote-code-update channel. Two registries serve the same source IDs from possibly different builds. [P0]

**How to avoid:**
- Store per install: repository URL, repository commit hash, extension version, file SHA-256, fetch time, and who installed it. Provenance is already a hard rule; make it a table, not a log line.
- Run only the stored hash. An update downloads to a pending state and shows a diff (version, hash, changed permissions or domains). The user approves it. Auto-update is off by default.
- Pin repository index files by commit, not by branch. Fetch by commit hash from the repository host.
- Key results by (extension package, class name, version, hash). Record the registry with every measurement.
- Record the licence declared by each repository at install time (see Pitfall 17).

**Warning signs:** an extension changed behaviour without a version bump; two installs of the same source give different hashes.

**Phase to address:** Phase 1 (registry client + provenance table), Phase 2 (update flow).

---

### Pitfall 8: The polyfill fixes live outside the build

**What goes wrong:** The interceptor-chain patch is applied by hand to `node_modules`. `npm ci` (which the project's worktree rule requires) silently removes it. Extensions with rate-limiter + cookie-store interceptors then misbehave, and results are invalid again. The `formDidChange` gap is a stub in the probe host only. The package is a caret range over an alpha (`^1.0.0-alpha.64`), so an update can move to another alpha and the patch can apply to the wrong line. Unknown further gaps fail with generic errors that the classifier mislabels. [P0]

**How to avoid:**
- Fork or vendor the polyfills (r52/gagaku, MIT, already implements every gap) or use `patch-package` with an exact pin. Add a test that fails if the patched behaviour is absent: register two interceptors and assert the second sees the first's mutation.
- Pin the exact version. Record the polyfill version and the Node version with every result.
- Log every call into a host stub. A stub called by a real source is a feature request, not a no-op.
- Add `HOST_CONTRACT` and `NEEDS_AUTH` to the error taxonomy (Pitfall 18).

**Warning signs:** the interceptor test is missing from CI; sudden cookie/header regressions after a fresh install.

**Phase to address:** Phase 1.

---

### Pitfall 9: Verification that quarantines but cannot be resolved

**What goes wrong:** Phase 5 quarantines chapters on disagreement. With no reader and no review tool, quarantined chapters pile up. Users bypass the check or the library stalls. Related traps: waiting for a second source that never arrives (single-witness series), blocking brand-new chapters because the second source publishes a day later, and downloading from two or three sources per chapter, which doubles the request load that triggers bans.

**How to avoid:**
- Give each Fill a visible state: `verified`, `single-witness`, `weak-corroboration`, `disputed`, `quarantined`. Single-witness chapters enter the library marked as such (the rule says "when a second source exists", so a missing second source must not block). Upgrade later when a second source appears.
- Put a time-boxed hold on new chapters ("wait up to N hours for a second witness"), configurable per Work.
- Verify cheaply first: page count, dimensions, then a sample of aligned pages. Only fall back to full comparison when the cheap pass is ambiguous. Budget second-source requests through the same per-host queue.
- Build a minimal review screen: two Fills side by side, aligned pages, hash distances, accept A / accept B / keep both / reject. This is not a reader. It is the operator's tool.

**Warning signs:** quarantine count only grows; users ask to switch the check off; second-source download volume exceeds first-source volume.

**Phase to address:** Phase 5 (states, hold window, review screen), Phase 7 (request budget).

---

### Pitfall 10: Scanner races, partial files and lost read progress

**What goes wrong:** Kavita and Komga scan while files are written. Kavita's docs do not address files being written, and it decides whether to rescan a folder from the folder's last-write time at one-minute granularity, so changes within the same minute can be missed. [V] Network mounts often have no inotify, so folder watching may not fire. [K] A scan aborts when a library folder is empty or inaccessible. [V] An unmounted library volume can look like "all books deleted" to a reader that does not abort (verify in Komga). [K] Replacing or renaming a CBZ (for a better-quality version) can orphan read progress in the reader. [K]

**How to avoid:**
- Staging directory lives on the same filesystem as the library but outside any library root (and with a leading-dot name). `rename(2)` across filesystems fails with EXDEV, so a cross-mount staging path breaks atomicity.
- Write CBZ to `*.tmp` in staging, `fsync` the file, rename into the final path, then `fsync` the directory. Never write a final name until complete.
- After landing, trigger the reader's scan through its API (Kavita scan-folder, Komga library scan) instead of relying on watchers. Touch the series folder after rename so the last-write time changes, and debounce so a burst of landings makes one scan.
- Use stable, deterministic paths and filenames. Replace a Fill only by explicit decision (Pitfall 20). Keep the old file until the new one is verified, and swap with one rename.
- Guard against an unmounted library: refuse to start the writer and refuse to land if the library root is missing a sentinel file.
- Orphan cleanup: a startup sweep removes stale staging directories older than a TTL and reports them.

**Warning signs:** chapters present on disk but missing in the reader until a manual scan; `.tmp` files seen by the reader; read progress reset after a re-download.

**Phase to address:** Phase 1 (staging contract and atomic rename, sentinel), Phase 3 (scan triggers, stable paths), Phase 6 (progress behaviour test with real readers).

---

### Pitfall 11: Komga API emulation by guesswork

**What goes wrong:**
- Different clients call different endpoints. Mihon's Komga extension uses the deprecated `GET /api/v1/series`; Paperback 0.9 uses `POST /api/v1/series/list`. Komga's deprecation page lists `GET /api/v1/series` as deprecated since 1.15.0 with removal planned for 2.0.0 [V via search summary; the page itself returned 404 on a direct fetch, re-check]. Implement both (already planned) and test each against the real client, not the spec.
- Komga's real responses carry fields clients depend on silently: Spring-style page objects (`content`, `totalElements`, `totalPages`, `number`, `size`, `first`, `last`, `empty`), metadata objects with `*Lock` booleans, string ids, 1-based page numbers on `/books/{id}/pages/{n}`. [K] An emulator that returns a subset passes a curl check and breaks the client's pagination or sort.
- The `POST /series/list` body is a condition tree (`allOf`/`anyOf`, library, read status, release date, and so on) [K]. Implementing the conditions one client sends today leaves a 500 or an empty list for the next client.
- Series and book ids must be stable across re-imports and across restarts. Clients cache ids and store them in their own library DB.
- The no-reader rule collides with the page endpoint (Pitfall 12, item on bytes).
- Authentication: Komga accepts Basic auth, API key header and a session cookie. Clients differ. [K]

**How to avoid:**
- Capture real traffic (HAR or reverse-proxy logs) from Mihon, Paperback 0.9, Panels and Kavita-adjacent clients against a real Komga instance. Turn each captured request/response pair into a contract test (record, replay, diff the JSON shape). Commit the captures (no secrets, no copyrighted images).
- Pin the Komga version the contract is based on. Return a version string clients accept. Log every unknown route and unknown query or body field, with the client's User-Agent, and fail loudly in dev.
- Generate ids from the stable Work/Slot ids, never from row order.
- Build the `/api/v1/*` surface in its own router. It must not share path prefixes with Aizoban's own `/api` routes.

**Warning signs:** a client lists series but cannot open them; paging stops after page 1; sort or filter ignored; 404s for routes the real Komga serves.

**Phase to address:** Phase 6 (contract tests from captures), Phase 3 (stable id scheme decided with the schema).

---

### Pitfall 12: ComicInfo.xml field misuse

**What goes wrong:** ComicInfo is a loose schema, and readers read it differently. From the 2.1 draft schema [V]: `Number` is a string (so `12.5`, `12a` are legal), but `Volume`, `Count`, `Year`, `Month`, `Day` are integers defaulting to `-1`, `PageCount` is an integer, `Format` and `LanguageISO` are free strings, `Manga` is an enum (`Unknown`, `No`, `Yes`, `YesAndRightToLeft`), and `Page@Image` is an integer index. Kavita adds its own meanings [V]:
- Any non-zero `Count` marks the series Ended, unless the field is locked; a `Count` equal to the owned volume or chapter total marks it Completed. Setting `Count` to the current chapter count of an ongoing series therefore marks it Completed.
- `Format` values such as TPB, Omnibus, Annual, One-Shot or GN can force a chapter into Specials.
- Metadata inside the archive overrides values parsed from the filename, so a wrong ComicInfo beats a correct filename.
- `Series` / `LocalizedSeries` / `SeriesSort` decide series grouping. A different spelling in one chapter's file makes a duplicate series.
- Release year uses only values above 1000, and `AgeRating` takes the most mature value across files.
- The file must be named exactly `ComicInfo.xml` at the archive root.

Two traps repeat the Phase 0 parser bug in our own output: writing the chapter number into `Volume` (the MangaFox mistake), and writing `Volume` 0 or -1 where "absent" is meant.

**How to avoid:**
- Write one `ComicInfo` builder with a schema-validated serializer and a golden-file test per case: whole chapter, fractional chapter, volume-only special, oneshot, ongoing series, completed series.
- Rules: write `Number` from the verified Slot (as string, `12.5`), `Volume` only when known (omit otherwise; never put a chapter number there), `Count` only for series known to be complete (omit for ongoing), `Manga` = `YesAndRightToLeft` for right-to-left titles, `PageCount` = actual number of image files, `Series` byte-identical across every chapter of a Work (one canonical string), and `Pages` entries only if complete and correct.
- Escape XML. Use UTF-8 without a BOM. Normalise Unicode (NFC) for the series string.
- Do not put provenance secrets in ComicInfo (`Web`, `Notes`) beyond what is public. Keep full provenance in the database.
- Test with real Kavita and Komga containers (Manga library type and Comic library type). The Phase 1 smoke test opens a chapter in Kavita only. Add Komga, a fractional chapter, a series with "Special" in its name, and a series with a CJK title.
- Also mind the CBZ itself: store images uncompressed (JPEG/PNG gain nothing), zero-padded page names (`001.jpg`) so lexical order is reading order, no nested directories, no path traversal names, extension matching real content.

**Warning signs:** an ongoing series shows as Completed; one Work appears as two series; a fractional chapter lands in Specials; the reading direction is wrong.

**Phase to address:** Phase 1 (builder + golden tests + Kavita smoke), Phase 3 (Komga check, naming rules), Phase 6 (readers matrix).

---

### Pitfall 13: OPDS-PSE implemented from the spec text

**What goes wrong:** The PSE 1.2 spec has internal inconsistencies [V]: pages are "numbered from 0 to N-1" in the notes, but `lastRead` is 1-based; attribute names are bare in the normative list and `pse:`-prefixed in the example; `type` allows only `image/jpeg`, `image/gif` or `image/png`; `{maxWidth}` is optional and there is no height placeholder; the server must not split double-page images; caching and error behaviour are unspecified; it defines no write-back of reading progress. A server that streams WebP/AVIF pages as-is will break clients that trust the declared type. An off-by-one on page numbering shows the cover twice or drops the last page. Credentials embedded in OPDS URLs leak into logs, shared links and client caches. [K]

**How to avoid:**
- Test against the clients that matter (Panels, plus any other PSE-capable client) with the page numbering the real implementations use (Komga and Kavita are listed as implementations [V]). Make the base explicit in code and tests (`firstPageIndex`).
- Serve declared types only. Transcode WebP/AVIF/odd formats to JPEG on the fly, with `maxWidth`, through a cache.
- Emit both attribute forms the clients accept after testing. Keep `pse:count` accurate (equals the actual image count).
- Use OPDS 1.2 for PSE. Do not assume an OPDS 2 feed carries a PSE form.
- Decide progress sync explicitly (write-back by Komga progress API only, or by observing page requests) and document that PSE-only clients do not sync.
- API keys: per-user, revocable, read-only scope, hashed at rest. Accept header auth where the client allows; where the URL carries the key, redact it in logs and set `Referrer-Policy: no-referrer`.

**Warning signs:** the first or last page missing in a PSE client; blank pages for WebP chapters; keys visible in access logs.

**Phase to address:** Phase 6.

---

### Pitfall 14: Per-host limits that are not limits

**What goes wrong:**
- MangaDex allows about 5 requests/second/IP, 40/minute on `/at-home/server/{id}`; continuing after 429 triggers a temporary IP ban (403 on all `*.mangadex.org`), and requests during a block renew the cooldown. A few IPv4 subnets are banned forever. A real, non-spoofed `User-Agent` is required, a `Via` header is forbidden, and hotlinking is blocked (a wrong image is served). Clients are asked to report image fetch outcomes. [V]
- Aggressive retry after 429 or Cloudflare 403 converts a rate limit into a ban.
- `pg-boss` `singletonKey` is a de-duplication key (one queued or active job per key), not a rate limiter. [K, verify in the pinned version] Per-host throttling needs a real token bucket or concurrency group.
- The Paperback extensions' rate-limiter interceptor runs inside each extension process, so N workers or N extension processes multiply the rate. [K]
- A cron "check all works for new chapters" fires every request at the same minute.
- Verification (Pitfall 9) multiplies requests per chapter.

**How to avoid:**
- One shared limiter per host, in Postgres or one coordinator, enforced in the host-owned fetch (Pitfall 6), so no extension can bypass it. Limits are data (per host: rps, burst, concurrency, daily cap), with documented defaults for known hosts.
- Honour `Retry-After` and `X-RateLimit-*` headers. A 429 pauses the whole host queue. A 403 or Cloudflare challenge opens a circuit breaker with exponential cool-down. Never retry a 403 in a loop.
- Jitter the scheduled checks. Spread a refresh over hours.
- Respect `User-Agent` rules (honest UA, no `Via`).
- Prefer API paths over scraping where a site has an official API.

**Warning signs:** rising 429 ratios; sudden run of 403s from one host; a pass rate that collapses for one host only.

**Phase to address:** Phase 1 (per-host queue and limiter plumbing, as decided), Phase 7 (tuning, circuit breakers, aperture concurrency).

---

### Pitfall 15: Pass-rate and Cloudflare numbers measured wrongly or not at all

**What goes wrong:** The 53.1% (222/418) and 65.5% of reachable are one-day snapshots. The headline merges two result files by hand (221 + 1 retry). The classifier hides host-side errors inside source failures, so "zero failures for a missing host ABI" cannot be shown from the data. The child kill timeout (180 s) is shorter than the stage budget. Cloudflare blocks 64 of 418, and a clearance cookie is tied to the solving client's User-Agent and IP, so a solver whose fingerprint differs from the worker's gets the challenge again. [P0, plus V via search on FlareSolverr behaviour] The switching trigger (reachable pass rate < 60% for a month) has no data source.

**How to avoid:**
- Run a scheduled canary: every installed source, search to pages, daily, results stored with Node version, polyfill version, extension hash, registry. This is the data source for the switching trigger. Define the denominator in writing (reachable = not Cloudflare, not network).
- Fix the classifier before porting it. Add `NEEDS_AUTH` and `HOST_CONTRACT`. Drop "Cannot read" and "undefined is not" from the `PARSER_CHANGED` pattern. Read the result over IPC, not stdout.
- Treat Cloudflare as "unreachable", not "broken". The solver is a separate process (already planned) and must share User-Agent, IP and cookie jar with the fetcher that reuses the clearance. Expect it to break periodically and make the failure mode "source paused", not a retry storm.
- Re-run the 418-source sweep on the Node LTS line before gating on it.

**Warning signs:** the pass rate drifts with no code change; the same sources alternate between pass and Cloudflare; the solver works once and fails on reuse.

**Phase to address:** Phase 1 (taxonomy and IPC result), Phase 2 (canary), Phase 7 (solver identity matching).

---

### Pitfall 16: Source and chapter ids that change under you

**What goes wrong:** Mihon derives default source ids from the source name, language and version id (first 16 hex chars of an MD5, sign bit cleared), so a rename or version bump orphans library rows. [V] The same trap applies to Paperback extension ids and to the upstream site's manga and chapter ids: a site migration changes URL schemes, and every chapter looks new, so the worker re-downloads the whole Work. Extensions are also updated by third parties, so "same source" can change behaviour.

**How to avoid:**
- Key sources on (extension package, class name), as decided. Store the installed version and hash separately.
- Key Fills on a content fingerprint plus (witness, remote chapter id, raw label). When remote ids change but content digests match existing Fills, re-map instead of downloading again. Hash-match before download is not possible, so use label + page count + a cheap first-page check, then reconcile.
- Keep a "source alias" table so a renamed or forked extension continues the history of the old one, with user confirmation.
- Provide a dry-run for any source update: show how many chapters would be new.

**Warning signs:** a source update makes the "new chapters" count jump to the whole series; library entries lose their Witness after an extension update.

**Phase to address:** Phase 2 (source identity, update flow), Phase 4 (remap on id change).

---

### Pitfall 17: Legal posture undermined by convenience

**What goes wrong:** The project runs community extensions that scrape sites. Distribution is the exposure. Tachiyomi shut down after a legal threat from Kakao's anti-piracy division and removed extensions on request. Mihon's own post (2025-11-05) says that complying did not end the risk while third parties kept redistributing extensions or implying affiliation, and lists attribution, no unofficial distribution, and disowning impersonators as the response. [V] Keiyoushi has faced GitHub DMCA notices. [V via search, unconfirmed date and outcome] Convenience features that weaken the posture: a pre-filled default repository URL, a "recommended sources" list, screenshots with named piracy sites, a hosted demo, a cache of images, or bundling extension code into a Docker image or release artifact.

**Why it matters for licensing:** the hard rules state that inkdex extensions are GPL-3.0. Bundling them, or distributing a derivative work that combines them with AGPL code, brings GPL obligations and a takedown surface. The licence of the converted registry used in Phase 0 (`nicartjay.github.io`, a TypeScript port of Keiyoushi sources) was not established, and two registries serve the same source ids. [P0]

**How to avoid:**
- Ship with an empty repository list. The user types a repository URL. The first-run flow shows a short notice that the user is responsible for what they add, then records the acknowledgement with the provenance.
- No hosted instance, no image cache served to third parties, no extension code in images or releases, no default URLs in docs, tests or fixtures (the committed fixtures are metadata only; keep it that way).
- Record the licence of each repository (read from its `LICENSE` or `package.json` at install time) in the provenance table, and show it in the UI.
- Keep a clear statement in the README that the project is not affiliated with any extension project or site.
- Get a legal read on two points before a public release: whether loading GPL-3.0 extension code at runtime inside an AGPL-3.0 host creates a combined work, and the status of the converted registry. This is not legal advice and the question is open.
- Build a "remove source and purge" path that works within minutes, to honour a takedown request in a user's own deployment.

**Warning signs:** a PR that adds a default URL; a test that fetches from a named site from CI; a Docker layer containing extension code.

**Phase to address:** Phase 1 (empty registry, provenance table, licence capture), Phase 8 (docs and release review).

---

### Pitfall 18: Error taxonomy that retries the wrong things

**What goes wrong:** The taxonomy drives retry. A misclassification either hammers a host (retrying `CLOUDFLARE_CHALLENGE`) or gives up on transient failures (treating a timeout as permanent). Phase 0 shows the classes are leaky: host contract errors are counted as extension failures, login-required sources are counted as crashes, and the `TIMEOUT` count mixes stage timeouts with child kills. [P0]

**How to avoid:**
- Define the taxonomy as a protocol shared by worker and app (a typed enum plus fields: stage, host, retry class, evidence). Unknown errors map to `UNKNOWN`, which retries a small fixed number of times and then pauses the source and alerts.
- Classes needed beyond Phase 0: `NEEDS_AUTH`, `HOST_CONTRACT`, `RATE_LIMITED` (429), `BANNED_OR_BLOCKED` (403 / silent), `GEO_OR_LICENSE_BLOCKED`, `CONTENT_PLACEHOLDER` (a hotlink-denied image served with 200), `ID_CHANGED`.
- Retry class lives in data: `retry_now`, `retry_with_backoff`, `pause_source`, `fail_permanent`, `needs_human`.
- Unit-test the classifier against recorded messages from `results/sweep418.jsonl`.

**Warning signs:** one error class holds more than 20% of failures and contains unrelated messages; a source oscillates between retry and give-up.

**Phase to address:** Phase 1 (protocol), Phase 7 (per-class retry tuning).

---

### Pitfall 19: Saving junk as pages

**What goes wrong:** A page URL returns HTTP 200 with something that is not the page: an HTML error page, a hotlink-denied placeholder, a "please enable cookies" image, a watermark or ad page, a truncated JPEG, or an expired signed URL result. MangaDex states it serves the wrong response for hotlinked images. [V] Plain `fetch` loses the extension's `Referer`, cookies and image interceptors, which produces exactly these responses. The junk gets hashed, and a junk page can even "match" another junk page and pass verification. At-home style URLs also expire, so queued downloads fail late. [K]

**How to avoid:**
- Download page images through the host layer using the extension's request pipeline (interceptors, headers, cookies).
- Validate every image before it counts as a page: status, content type, magic bytes, full decode succeeds (`sharp`), dimensions above a floor, size within a cap, not a known placeholder digest. Keep a growing digest blocklist of known placeholders.
- Fetch page URLs immediately after the extension returns them. Never store signed URLs for later. Re-resolve them at download time.
- Stream to a staging file with a size limit. Check the staged byte count against `Content-Length` when present.
- Record per-page results in the manifest (size, dimensions, digest, content type, attempts).

**Warning signs:** many identical-size pages across chapters; verification matches for pages that look blank; HTML bytes inside `.jpg` files.

**Phase to address:** Phase 1 (manifest fields and validation), Phase 5 (placeholder detection by recurrence).

---

### Pitfall 20: Churning the library with "better" copies and re-uploads

**What goes wrong:** Assay measures quality (dimensions, JPEG quality, upscale detection) and prefers the best Fill. The preference flips as sources re-upload, so the library file is replaced repeatedly, and readers lose progress or rescan each time (Pitfall 10). Sites also silently replace a chapter's images after release (fixes, redraws, license changes). Upscaled, over-compressed or watermarked copies can score better than a clean smaller copy on naive metrics.

**How to avoid:**
- A verified Fill is sticky. Replacement needs positive evidence (both Fills verified as the same content, and the new one better by a margin on a documented rule), plus a hysteresis margin and a cool-down. Never replace on a tie.
- Keep the previous Fill until the new one lands. Record the supersession in the database so it can be undone.
- Detect re-uploads by comparing the manifest digest on each refresh, and treat a change as a new claim, not as an overwrite.
- Score quality from native resolution and artefact signals, not from file size. Penalise detected upscaling.

**Warning signs:** the same chapter replaced more than once in a month; progress resets reported by users.

**Phase to address:** Phase 5.

---

### Pitfall 21: Import that reports "done" too early

**What goes wrong:** The import mount is read-only and the user deletes the source afterwards, so a wrong "done" destroys data. Typical failures: files skipped silently because the archive is corrupt, a RAR/7z/PDF/EPUB the importer cannot read, a duplicate-detection false positive, a partial copy, a filename collision on a case-insensitive filesystem, a CJK title that exceeds 255 bytes (3 bytes per character in UTF-8 gives about 85 characters), reserved characters, NFC vs NFD names across macOS and Linux, and file ownership that the readers cannot read (UID/GID mismatch). Archive hazards: zip path traversal names, zip bombs, and huge entry counts. [K]

**How to avoid:**
- Every source file gets a row in an import ledger with one disposition: `imported` (with the target path and verified digest), `duplicate_of` (with the evidence), `unresolved` (with the reason), `failed`. "Done" is derived from the ledger: zero `unresolved` and zero `failed`, every `imported` row re-read and digest-checked on the target. Show the ledger before the user deletes anything.
- Copy only (never hardlink, never move). Copy to staging, verify, rename. Cap decompressed size and entry count; reject path traversal entries.
- Path builder: sanitise to the target filesystem, truncate by bytes not characters, keep a database-side full title, handle collisions with a suffix rule, normalise to NFC.
- Create files with a configurable uid/gid and mode so Kavita and Komga can read them.
- Importing existing files requires identification (Pitfall 2) and verification where a second source exists. Files that cannot be identified go to `unresolved`, not into a guessed Work.

**Warning signs:** counts of files in the mount and rows in the ledger differ; "done" reported while any row is `unresolved`.

**Phase to address:** Phase 3.

---

### Pitfall 22: Content-rating filtering that leaks

**What goes wrong:** Content rating is a schema concept so that one household can share one library and projections scoped by key hide adult content. Leaks happen outside the obvious list endpoint: search, recent and "on deck" lists, the series counts in library statistics, thumbnails and page endpoints reachable by id, OPDS feeds and PSE links, ComicInfo `AgeRating` in the file (Kavita takes the most mature across files), and cached responses keyed without the user. [K]

**How to avoid:**
- Enforce the filter in one query layer (a scoped repository or a database row-level policy), not in each handler. Image and file endpoints check the scope of the owning Work, not just the session.
- Test matrix: every route (Komga API, OPDS, PSE, own API) x restricted key x adult Work, asserting 404 and not 403. Counts and facets are filtered too.
- Cache keys include the scope.
- Write `AgeRating` into ComicInfo from the same source as the filter, so the readers' own filters agree.

**Warning signs:** a restricted key sees a thumbnail by id; library counts differ between keys.

**Phase to address:** Phase 1 (schema and scoped query layer), Phase 6 (route matrix).

---

### Pitfall 23: Bytes in the web process, after all

**What goes wrong:** The hard rule says image bytes never pass through the web process. Acquisition follows that, but Phase 6 needs to serve pages: Komga `/books/{id}/pages/{n}`, thumbnails, file download, and OPDS-PSE streaming all read CBZ content, often with resizing or transcoding. Doing that in a Next.js route handler puts bytes (and CPU-heavy `sharp` work) in the web process, buffers whole files, and ignores range and conditional requests. [K]

**How to avoid:**
- Rewrite the rule's scope in `AGENTS.md`: "acquisition image bytes never pass through the web process". Decide serving separately.
- Serve pages and files from a small media process (or the reverse proxy with `X-Accel-Redirect` / `sendfile` for plain file serving) that reads the library read-only. The web process authorises and issues a signed, short-lived path.
- Support `Range`, `ETag`, `If-None-Match`, `Cache-Control` for files and thumbnails. Stream with Node streams. Never `arrayBuffer()` a whole CBZ.
- Generate thumbnails and resized pages in a job and cache them, not on request.

**Warning signs:** web process memory grows with reading; slow first page in a client; clients re-download unchanged files.

**Phase to address:** Phase 6 (decision before design), with a note in Phase 1 about the rule's wording.

---

## Moderate Pitfalls

### Pitfall 24: Huge images and sharp limits
**What goes wrong:** Stitched webtoons can be 800 x 30,000+ pixels per file. `sharp` enforces `limitInputPixels` by default and throws, or a decode uses large memory when many run in parallel. A native binary also differs by platform and Node version. [K]
**Prevention:** Set `limitInputPixels` and concurrency explicitly. Decode with `sequentialRead`. Hash from a downscaled decode. Pin `sharp` and test the install on the Node LTS line in CI and in the Docker base.
**Phase:** 5.

### Pitfall 25: Quadratic comparison and naive DCT
**What goes wrong:** The probe compares every page of one source with every page of another for every pair, and recomputes cosines in a 32 x 32 DCT (about a million operations per page). Template detection compares all pages across works. This is fine for six works and slow for a household library of hundreds. [P0]
**Prevention:** Hash once per file and persist (`hash_algo`, `bits`). Compare only inside the candidate Slot alignment. Use a coarse index for template detection (bucket by hash prefix, or a BK-tree). Precompute the cosine table.
**Phase:** 5, 7.

### Pitfall 26: Number storage and sorting
**What goes wrong:** Floats (`12.5`, `0.1 + 0.2`), lexical sorting (`10` before `2`), string compare of `12.50` and `12.5`, and a unique constraint on number that rejects legitimate duplicates (volume extras with the same number).
**Prevention:** Tuple or fixed-point decimal key. Unique constraints on Slot id, not on number. Test sort order against Kavita's.
**Phase:** 3.

### Pitfall 27: Release dates and timezones
**What goes wrong:** Epoch placeholders, "2 days ago" strings parsed in the server's timezone, and dates used for ordering across sources.
**Prevention:** Store `null` for unknown. Store the raw date string. Use dates only for "recently updated" hints, never for identity or order.
**Phase:** 1 (schema), 4.

### Pitfall 28: Extension state and WebView flows
**What goes wrong:** Some extensions need a login or a WebView flow ("Log in via WebView"). The host has none, and these fail as crashes. Settings forms (`formDidChange`) need a host. Per-extension persistent state (cookies, tokens, settings) must survive restarts and must not leak across extensions.
**Prevention:** Per-extension state namespace in the database, mediated by the host (the extension has no database). Classify as `NEEDS_AUTH` and show it in the UI. Keep the settings form renderer (Phase 8) behind the same host contract.
**Phase:** 1 (state API), 8 (forms).

### Pitfall 29: Docker and operations
**What goes wrong:** Files written as root that Kavita cannot read, staging and library on different volumes, disks filled by staging, orphan staging directories after a crash, Postgres as both queue and system of record without a backup plan, and no `HEALTHCHECK`.
**Prevention:** `PUID/PGID` settings, one volume that contains both staging and library, a free-space guard that pauses the queue, a startup sweep, a documented backup (Postgres dump plus manifest folder). Use the Node LTS line in all bases.
**Phase:** 1, 8.

### Pitfall 30: Metadata provider sprawl
**What goes wrong:** The product is also a metadata manager. External providers (MangaDex, AniList, MangaUpdates, MAL) have their own rate limits, id spaces, terms and wrong matches (Pitfall 2 applies to them too). Metadata fields overwrite each other on refresh, and manual edits are lost.
**Prevention:** Field-level provenance and a "locked by user" flag per field. Provider matches are claims with evidence like Witness links. Decide which provider is the first one before the schema freezes. No roadmap phase names provider metadata, so confirm scope.
**Phase:** 3 (schema), flag as an open scope question.

---

## Minor Pitfalls

### Pitfall 31: Child result read from stdout
**What goes wrong:** Extension `console` output shares stdout with the result line, and a crash can truncate it.
**Prevention:** Return results over IPC. Keep stdout for logs.
**Phase:** 1.

### Pitfall 32: Resume breaks on a partial last line
**What goes wrong:** JSONL result logs cut off by a crash fail `JSON.parse` on restart.
**Prevention:** Skip unparsable trailing lines, or write to a temp file and rename. For product state, use the database.
**Phase:** 1 (any job log).

### Pitfall 33: Fixture and snapshot rot
**What goes wrong:** Fixture scripts skip existing files, so refreshes never happen, and figures describe one day. Page fixtures are git-ignored, so the pHash numbers cannot be reproduced from the repo.
**Prevention:** `--refresh` flag, snapshot date inside each result file, and a committed digest manifest of page fixtures. Treat Phase 0 numbers as inputs to design, not as gates.
**Phase:** 1.

### Pitfall 34: Secrets hygiene
**What goes wrong:** `.gitignore` lacks `.env*`, `*.pem`, `*.key`, `secrets/` before the first config file arrives.
**Prevention:** Add them in the first Phase 1 commit.
**Phase:** 1.

### Pitfall 35: Kavita keyword parsing
**What goes wrong:** Kavita treats chapters whose names or `Format` carry keywords such as "Special" or "Omake" as Specials [V for Format; K for filename keywords]. A real series with such a word in its title may be misfiled.
**Prevention:** Include a test series named with such a word in the reader matrix.
**Phase:** 6.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `node:vm` and add a process later | Fast port of `host.mjs` | The extension reaches `process`; every later feature builds on a host with credentials in scope | Never |
| Key Slots by chapter number | Simple joins, easy UI | Silent misalignment (Pitfall 1); migration of every Fill later | Never |
| Float chapter numbers | Easy sorting | Collisions and rounding; migration of keys | Never |
| Per-process rate limiting inside extensions | Works with one worker | Rate multiplies with workers; ban risk | Only in a single-process dev setup |
| Apply the polyfill patch by hand | No fork to maintain | `npm ci` removes it; invalid results | Never past Phase 1 start |
| Cron "update all" without jitter | One job to write | Request burst; ban | Only with a single source in dev |
| Hard-code the Komga fields clients used today | Faster emulation | Next client breaks; 2.0 removals | Only with captured contract tests that make breakage visible |
| Skip the review screen for quarantine | Fewer UI pages | Dead pile; users disable verification | Never |
| Compute pHash on demand | No schema | Cost every comparison; no algorithm versioning | Only in a spike |
| Trust Phase 0 headline numbers as gates | Saves re-measuring | Several are unreproducible or fitted (10.4%, threshold) | Only as planning inputs |
| Store signed page URLs for later download | Decouples jobs | URLs expire; junk images | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Kavita | Rely on folder watching; write final names directly; trust filenames | Stage outside library roots, atomic rename, trigger scan by API, touch folder, validate ComicInfo semantics (`Count`, `Format`) |
| Komga | Implement the spec, not the clients; unstable ids | Capture real client traffic; stable ids; both GET and POST list endpoints |
| Mihon (Komga extension) | Assume POST list | Support deprecated `GET /api/v1/series` until Komga 2.0 behaviour is known |
| Paperback 0.9 | Emulate partially | Contract-test `POST /api/v1/series/list` bodies the client sends |
| OPDS-PSE clients | Page base off by one; WebP served as JPEG | Fix base in tests; transcode to declared types |
| MangaDex | Ignore 429; spoof UA; hotlink | Honour limits (5 rps, 40/min at-home), honest UA, no `Via`, proxy images, report outcomes |
| Cloudflare solver | Clearance cookie reused with a different UA or IP | Same fingerprint for solve and fetch; pause the source on failure |
| pg-boss | Use `singletonKey` as a throttle | Separate limiter; verify group concurrency support in the pinned version |
| sharp | Default pixel limits, unbounded concurrency | Set `limitInputPixels`, concurrency, pin version |
| Extension registries | Fetch by branch, run what you get | Pin by commit and hash, store provenance and licence |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| All-pairs page comparison | Assay jobs run for hours | Compare inside candidate Slot alignment; hash index | About 100 works x 5 witnesses |
| Naive DCT, recompute hashes | CPU pegged, slow imports | Precomputed table, persisted hashes | Importing a few thousand chapters |
| Decoding stitched webtoons in parallel | Memory spikes, `sharp` pixel-limit errors | Limit concurrency, sequential read, downscale first | 20,000 px tall images |
| Update checks all at the same minute | 429/403 bursts | Jitter, per-host buckets, staggered schedule | 50+ works on one host |
| Verification that fetches every witness fully | Request volume 2-3x | Cheap checks first, sample pages | Any ongoing series with 2+ witnesses |
| On-demand thumbnails/transcodes in web process | Slow lists, memory | Precompute in jobs, cache | First client opening a 1,000-series library |
| Extension process per request | Cold start latency | Keep a pool with idle timeout, capped per extension | Dozens of concurrent jobs |
| Queue table growth | Slow job fetch | pg-boss retention and archive settings | Months of daily canary and update jobs |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Extension runs with host objects, env or DB reach | Full compromise of the server and library | Process + container isolation, clean env, host-owned fetch (Pitfall 6) |
| SSRF through page, cover or redirect URLs | Extension reads LAN services and metadata endpoints | Allowlist, resolve and re-check IPs after redirects, block private ranges |
| Unbounded image download | Memory or disk exhaustion | Stream to staging with size cap and `Content-Length` check |
| Unpinned bundle update | Remote code update channel | Hash pin, approval of updates (Pitfall 7) |
| Zip path traversal / bombs in imported archives | File overwrite, disk fill | Reject `..` and absolute entries, cap sizes and counts |
| API key in OPDS URLs | Key leak via logs, referrers | Per-user revocable keys, redaction, header auth where possible |
| Basic auth over plain HTTP on the LAN | Credential sniffing | Require TLS at the reverse proxy for non-local binds |
| Rating filter only on list endpoints | Adult content reachable by id | Scoped query layer and route matrix (Pitfall 22) |
| Extension state shared across extensions | Cookie or token theft between sources | Per-extension namespace, mediated by the host |
| Secrets in repo | Credential leak | `.gitignore` entries first; 1Password-sourced runtime secrets |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Missing chapter" shown as a fact | Users chase phantom chapters | Show evidence: which witnesses list it, which do not, confidence |
| Silent substitution of a source | Users do not know which copy they hold | Show provenance and verification state per chapter |
| Import "done" banner with unresolved items | Users delete the originals | Ledger view; disable "done" until zero unresolved |
| Source failure shown as a stack trace | Users cannot tell Cloudflare from a bug | Typed, plain-language failure classes with next step |
| No dry-run for source update | Surprise re-download of a series | Preview of new/changed chapters |
| Quarantine without tools | Dead pile | Side-by-side review screen (Pitfall 9) |
| Rating filter surprise | Kids' account sees an empty library with no explanation | Explain scope in the account page |

## "Looks Done But Isn't" Checklist

- [ ] **Staging and rename:** Often missing `fsync`, same-filesystem staging and a stale-staging sweep. Verify by killing the worker mid-write and checking that readers never see a partial file.
- [ ] **Polyfill fixes:** Often lost after `npm ci`. Verify a fresh clone passes the two-interceptor test.
- [ ] **Sandbox:** Often only a process boundary. Verify a hostile test extension cannot read env, files, DB or LAN.
- [ ] **Provenance:** Often only a URL. Verify commit, hash, version, licence and fetch time are stored and the run uses the stored hash.
- [ ] **Per-host queue:** Often only dedupe. Verify with a mock host that a 100-job burst stays under the configured rps and that a 429 pauses the host.
- [ ] **Komga emulation:** Often passes curl, fails a client. Verify against a real Mihon and Paperback 0.9 session, plus captured contract tests.
- [ ] **OPDS-PSE:** Often off-by-one or wrong type. Verify first page, last page and a WebP chapter in a real PSE client.
- [ ] **ComicInfo:** Often valid XML with bad semantics. Verify golden files and a Kavita and Komga run (ongoing series stays Ongoing, fractional chapter not a Special).
- [ ] **Verification:** Often counts byte-identical copies as two sources. Verify the origin cluster logic with a fixture.
- [ ] **Import:** Often reports done with skipped files. Verify with a mount containing a corrupt zip, a RAR, a duplicate and a 300-byte title.
- [ ] **Rating filter:** Often list-only. Verify the route matrix with a restricted key.
- [ ] **Canary:** Often missing. Verify daily results exist for the switching trigger.
- [ ] **Quarantine:** Often a status column only. Verify a person can resolve one in the UI.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong chapter filed under a Slot (Pitfall 1) | MEDIUM | Re-run verification on all Slots with `proposed`-only claims; quarantine failures; keep old Fills until replaced |
| Wrong Work link (Pitfall 2) | MEDIUM | Detach Witness, mark Fills unverified, re-run identity check, re-reconcile the Work |
| Slot keyed by number (Pitfall 1) | HIGH | Schema migration plus a re-matching pass over every Work; avoid by starting right |
| Threshold wrong (Pitfall 5) | LOW if hashes are versioned, HIGH if not | Re-evaluate stored hashes with the new rule; otherwise re-download pages |
| Sandbox escape suspected (Pitfall 6) | HIGH | Rotate every credential the worker could reach, rebuild images, audit extension hashes, restore from backup |
| Banned IP (Pitfall 14) | MEDIUM | Stop the host queue, wait for the cooldown (undocumented), lower limits, resume slowly; do not probe while blocked |
| Partial file seen by a reader (Pitfall 10) | LOW | Remove file, trigger rescan, fix staging path |
| Lost read progress after replacement (Pitfall 20) | MEDIUM | Restore the previous file path and mtime, rescan; the reader's progress may need manual restore |
| Library volume unmounted (Pitfall 10) | MEDIUM | Stop writers, remount, check readers did not trash records, rescan |
| Takedown request (Pitfall 17) | LOW with a purge path, HIGH without | Remove source and its cached data, record the action |
| Import "done" reported wrongly (Pitfall 21) | HIGH if the user deleted the source | Cannot recover; prevention only |
| Duplicate series from inconsistent `Series` strings (Pitfall 12) | LOW | Rewrite ComicInfo from the database in one pass, rescan |
| Source id churn (Pitfall 16) | MEDIUM | Alias table, remap by content, drop the duplicate Fills |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Number-keyed identity | 3 (schema), 4 | Tower of God per-season fixture reconciles with no silent alignment |
| 2 Wrong Work link | 3, 4 | The 9 known impostors from Phase 0 are rejected or flagged |
| 3 Witness parsers lie | 1 (schema), 4 | Raw-vs-parsed disagreement flagged on the committed fixtures |
| 4 Correlated witnesses | 5 | Byte-identical pair gives `weak`, not `verified` |
| 5 Threshold overfit | 1 (tests), 5 | Held-out works; overlap band reported and handled |
| 6 Sandbox | 1 (boundary), 8 (hardening) | Hostile test extension fails to reach env, fs, DB, LAN |
| 7 Unpinned bundles | 1, 2 | Run uses stored hash; update needs approval |
| 8 Polyfill fixes | 1 | Fresh clone passes the interceptor test |
| 9 Quarantine dead pile | 5, 7 | Review screen resolves a disputed chapter end to end |
| 10 Scanner races | 1, 3, 6 | Kill-mid-write test; reader scan triggered by API |
| 11 Komga emulation | 3 (ids), 6 | Captured-traffic contract tests pass for all four clients |
| 12 ComicInfo misuse | 1, 3, 6 | Golden files; Kavita and Komga run in compose |
| 13 OPDS-PSE | 6 | Real PSE client: first page, last page, WebP chapter |
| 14 Rate limits and bans | 1, 7 | Mock-host burst test; 429 pauses host |
| 15 Pass-rate measurement | 1, 2, 7 | Daily canary history exists; denominators documented |
| 16 Id churn | 2, 4 | Source update dry-run shows only real changes |
| 17 Legal posture | 1, 8 | Empty default registry; licence stored; purge path works |
| 18 Error taxonomy | 1, 7 | Classifier tested on recorded messages |
| 19 Junk pages | 1, 5 | Fixture of placeholder responses is rejected |
| 20 Library churn | 5 | Replacement needs margin and cool-down; undoable |
| 21 Import early "done" | 3 | Ledger test with corrupt, duplicate and over-long names |
| 22 Rating leaks | 1, 6 | Route matrix with a restricted key |
| 23 Bytes in web process | 6 (decision), 1 (wording) | Web process memory flat while reading |
| 24-30 Moderate | As listed | Per item |

## Phases that need deeper research before planning

- **Phase 4 (census):** matching algorithm and evidence model. Use the Phase 0 fixtures. Needs design work, not a library search.
- **Phase 5 (assay):** evaluation set and second signal for the overlap band. Needs labelled data.
- **Phase 6 (readers):** capture real traffic from Mihon, Paperback 0.9 and Panels against a real Komga and a real Kavita. Verify the Komga deprecation timeline, the page-object shape, and PSE page-numbering behaviour in each client. Highest uncertainty in this document.
- **Phase 7 (scale):** the Cloudflare solver, and the pg-boss concurrency-group feature in the pinned version.
- **Phase 1 (skeleton):** a short spike on container-level isolation for the extension process (network egress policy, uid, read-only root). Standard patterns, but the details matter.
- **Phase 2 (recipes), Phase 3 (library), Phase 8 (polish):** standard patterns, except the licence question in Pitfall 17, which needs a legal read before any public release.

## Sources

- [Node.js `vm` documentation](https://nodejs.org/api/vm.html) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4363): "not a security mechanism" [V, HIGH]
- Node.js permission model documentation (v24): no security guarantee against malicious code; no inheritance into child processes or workers; documented bypasses [V via search summary, MEDIUM]
- [ComicInfo 2.1 draft schema (Anansi Project)](https://raw.githubusercontent.com/anansi-project/comicinfo/main/drafts/v2.1/ComicInfo.xsd) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4351): field types, `Manga` and `AgeRating` enums, `Page` attributes [V, HIGH]
- [Kavita: Comics and Manga Metadata](https://wiki.kavitareader.com/guides/metadata/comics/) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4366): field semantics for `Count`, `Format`, `Number`, `Volume`, release year [V, HIGH]
- [Kavita: Library Scanner](https://wiki.kavitareader.com/guides/scanner/) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4353): last-write-time check at minute granularity, scan abort on empty folder, parse priority, no coverage of files being written [V, HIGH]
- [OPDS-PSE 1.2 specification](https://github.com/anansi-project/opds-pse/blob/master/v1.2.md) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4355): attributes, placeholders, numbering inconsistency, image types [V, HIGH]
- [Komga API deprecation page](https://komga.org/docs/api/deprecation) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4348): `GET /api/v1/series` deprecated since 1.15.0, replaced by `POST /api/v1/series/list`, removal planned for 2.0.0 [V via search summary, MEDIUM: direct fetches returned 404; re-read before Phase 6]
- [MangaDex API: Limitations and Requirements](https://api.mangadex.org/docs/2-limitations) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4356): rate limits, ban behaviour, User-Agent, `Via`, hotlinking [V, HIGH]
- [Mihon news, 2025-11-05, "potential threat"](https://mihon.app/news/2025-11-05-potential-threat) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4364): Tachiyomi shutdown context, takedown and distribution lessons [V, HIGH for what the post says; it is Mihon's account]
- Tachiyomi `HttpSource` source-id derivation (MD5 of name, language, version id; sign bit cleared), via a mirrored commit [V via search summary, MEDIUM]
- TorrentFreak coverage of Tachiyomi / Kakao and of the Aniyomi notice [search summary only, LOW]; GitHub DMCA records naming Keiyoushi repositories [search summary only, LOW]
- `probes/phase-0/README.md`, `.planning/codebase/CONCERNS.md`, `.planning/PROJECT.md` [P0, HIGH]
- Prior knowledge, not re-verified this session [K, LOW to MEDIUM]: Komga response shapes and condition-tree body; Komga behaviour on missing library roots; reader behaviour on replaced files; `pg-boss` `singletonKey` semantics; `sharp` pixel limits; EXDEV on cross-device rename; NFS and inotify; filename-keyword handling in Kavita

---
*Pitfalls research for: self-hosted manga acquisition / library / metadata manager*
*Researched: 2026-11-02*
