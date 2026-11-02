# Requirements: Aizoban

**Defined:** 2026-11-02
**Core Value:** Every chapter in the library is the chapter it claims to be: the app builds its own chapter authority from what sources testify, and verifies each chapter across sources before it enters the library.

Sources: open issues #5–#8 (Phase 1), the tracker milestone descriptions and exit criteria (Phases 1–8),
and the table stakes in `.planning/research/FEATURES.md`. Items marked *(research)* come from the
research, not from the tracker.

## v1 Requirements

Requirements for the planned product. Each maps to one roadmap phase.

### Foundation

- [ ] **FOUND-01**: Operator can boot the app (Next.js + TypeScript) against Postgres and get a passing healthcheck (#5)
- [ ] **FOUND-02**: A trivial job round-trips through pg-boss, and job queues are partitioned per source host from day one (#5)
- [ ] **FOUND-03**: Every acquisition failure carries a typed class from one error taxonomy (`CLOUDFLARE_CHALLENGE`, `PARSER_CHANGED`, `PAGE_HOTLINK_FORBIDDEN`, `EXTENSION_CRASH`, …) with a per-class retry policy (`PARSER_CHANGED` = 0 retries) (#5)
- [ ] **FOUND-04**: The first migration carries the Work / Witness / Slot / Fill shape and a content-rating field, so later phases change the arbitration, not the table shape (#5; shape *(research)*)
- [ ] **FOUND-05**: The vitest suite runs green (#5)

### Extension Host

- [ ] **HOST-01**: User can add an extension repository by URL through an explicit action; the app records the repository URL, commit hash and version of every installed extension; no extension ships with the app (#6)
- [ ] **HOST-02**: User can list, install, update and pin extensions from a repository's `versioning.json`; the worker runs only the bundle it stored, and an update runs only after the user approves it (#6; approval *(research)*)
- [ ] **HOST-03**: User can search an installed source, open a series' details and chapter list, and fetch a chapter's pages (#6)
- [ ] **HOST-04**: Each extension runs in its own process with no database and no filesystem access; one crashed extension does not take the worker down (#6)
- [ ] **HOST-05**: Extension state survives a worker restart, and secure state is stored securely (#6)
- [ ] **HOST-06**: The host fixes both polyfill bugs — every interceptor gets the mutated request, and `formDidChange` is implemented — proven by a test with two interceptors (#6)
- [ ] **HOST-07**: Sources are keyed on (extension package, class name), never on a numeric id (#6)
- [ ] **HOST-08**: A source whose search finds nothing returns an empty result, not an error (#6)

### Staging and Landing

- [ ] **STAGE-01**: The worker downloads a chapter into a staging volume with a `manifest.json` that lists, per page: index, mime, width, height, bytes, sha256, referer (#7)
- [ ] **STAGE-02**: The web process reads the manifest, never the page bytes (#7, hard rule)
- [ ] **STAGE-03**: A staged chapter becomes a CBZ with a correct `ComicInfo.xml` that Kavita opens, landed by stage + atomic rename; workers never learn final paths (#7)
- [ ] **STAGE-04**: Landing the same staged chapter a second time is a no-op (#7)
- [ ] **STAGE-05**: The raw chapter label is stored verbatim next to the parsed chapter number (#7)

### Deployment

- [ ] **DEPL-01**: Operator runs `docker compose up` on a fresh checkout and gets the app, `js-worker`, Postgres and a shared library volume, plus a Kavita container in the dev compose (#8)
- [ ] **DEPL-02**: Operator can search a source, pick a manga, download one chapter and open it in Kavita (#8, Phase 1 exit)
- [ ] **DEPL-03**: A headless smoke script runs that chain end to end (#8)

### Recipes

- [ ] **RCPE-01**: User can paste a Madara or MangaThemesia site URL; the app detects the template and configures a working source with no code
- [ ] **RCPE-02**: A recipe is YAML that carries identity and capability only, never selectors; a per-recipe code escape hatch is first-class
- [ ] **RCPE-03**: Of ten unknown Madara URLs, at least six become working sources with no code (Phase 2 exit)
- [ ] **RCPE-04**: A daily canary runs every installed source from search to pages and records pass/fail with Node, polyfill and extension versions — the data source for the decision 0001 switching trigger *(research)*

### Library

- [ ] **LIB-01**: User can follow a series; the app checks its witnesses for new chapters on a schedule and downloads them automatically
- [ ] **LIB-02**: Sources point into the Work's chapter list (Witness → Slot → Fill) instead of owning private chapter copies
- [ ] **LIB-03**: User can import an existing library from a read-only mount; files are copied in after confirmation, and the mount is never written to
- [ ] **LIB-04**: An import never reports "done" while any item is unresolved or failed
- [ ] **LIB-05**: User can re-file the whole library under a new path template with nothing lost (Phase 3 exit)
- [ ] **LIB-06**: The app fetches series metadata (title, alternative titles, summary, status, genres, cover) from one external provider *(research; placement is an open owner decision)*

### Census

- [ ] **CENS-01**: The app reconciles chapter numbering across witnesses into one canonical chapter list, handling offset, split, interstitial and renumber drift
- [ ] **CENS-02**: Each witness has a reconciliation map from its labels to canonical Slots, with the evidence for each alignment
- [ ] **CENS-03**: A missing-chapter report cites witness evidence, never the tracker count
- [ ] **CENS-04**: Renumbered witnesses are aligned by content verification, not by number agreement
- [ ] **CENS-05**: Work identity is checked before reconciliation, so a wrong series or edition never joins a Work
- [ ] **CENS-06**: User can override an alignment (merge, split, pin a witness), and the override survives re-runs *(research)*
- [ ] **CENS-07**: A series with a split chapter, an omake and a Part-2 renumber reconciles correctly and reports zero false missing chapters; `probes/phase-0/fixtures/chapters/` is the regression corpus (Phase 4 exit)

### Assay

- [ ] **ASSY-01**: Every page is measured on arrival: dimensions, JPEG quantisation quality, upscale detection
- [ ] **ASSY-02**: Every page is fingerprinted and compared across witnesses by content alignment (mutual nearest neighbour), with template pages excluded first and a page-count guard for stitched webtoons
- [ ] **ASSY-03**: A chapter whose witnesses disagree is quarantined and does not enter the library; a chapter with one witness is marked unverified, never passed silently
- [ ] **ASSY-04**: Credit and ad pages are detected by fingerprint recurrence, without ML
- [ ] **ASSY-05**: Byte-identical copies from aggregators count as one origin, not as independent witnesses
- [ ] **ASSY-06**: User can review a quarantined chapter side by side and accept it, reject it or swap the witness *(research)*
- [ ] **ASSY-07**: A placeholder-page chapter and a wrong-series chapter fed in deliberately are both caught and quarantined with nobody looking (Phase 5 exit)

### Readers

- [ ] **READ-01**: Mihon connects through its Komga extension and browses the library (deprecated `GET /api/v1/series`)
- [ ] **READ-02**: Paperback 0.9 connects and browses the library (`POST /api/v1/series/list`)
- [ ] **READ-03**: Panels, KOReader, Thorium and Moon+ read the library through OPDS 1.2 + PSE 1.2
- [ ] **READ-04**: PSE links exist for chapters not yet downloaded, and the chapter is fetched on demand
- [ ] **READ-05**: A reader authenticates with a per-user API key and sees a projection of the one library, filtered by content rating

### Scale

- [ ] **SCAL-01**: Each source host has its own queue, and its concurrency narrows when the host pushes back
- [ ] **SCAL-02**: Failures retry by typed class
- [ ] **SCAL-03**: A `solver` worker clears Cloudflare challenges, and cookies, user agent and TLS fingerprint travel together
- [ ] **SCAL-04**: The app stays with a working witness instead of swapping, and reports seams as a health metric
- [ ] **SCAL-05**: A week-long unattended run shows no starvation, no silent corruption and no bans (Phase 7 exit)

### Polish

- [ ] **POL-01**: An extension can describe a settings form that the UI renders
- [ ] **POL-02**: The extension sandbox is hardened at the process boundary (separate uid or container behind the same RPC)
- [ ] **POL-03**: Admin can manage users and API keys in the UI
- [ ] **POL-04**: Deployment and user documentation exist

## v2 Requirements

Deferred. Tracked, not in the current roadmap.

### Library Extras

- **XTRA-01**: User gets a notification on a new chapter or a failure (webhook, Apprise)
- **XTRA-02**: The app asks Kavita / Komga to scan after a chapter lands
- **XTRA-03**: Operator can back up and restore the app's own state
- **XTRA-04**: User can import follows from a Mihon backup (follows only, no read state)
- **XTRA-05**: A better verified Fill replaces the current one atomically (quality-based upgrade)
- **XTRA-06**: User can view the provenance trail of a chapter (which witness, which extension commit, which hashes agreed)
- **XTRA-07**: The app fetches metadata from more than one provider
- **XTRA-08**: A native extension format, only if it earns its place

## Out of Scope

| Feature | Reason |
|---------|--------|
| A reader | Not now, not later; Kavita and Komga do it better |
| Bundled extensions or a default source list | Legal posture; inkdex extensions are GPL-3.0; provenance would be lost |
| Kotlin/Suwayomi acquisition backend | Deleted unbuilt by decision 0001; returns only if a switching trigger fires |
| Selectors in YAML site definitions | YAML carries identity and capability; behaviour is code |
| Per-user library directories | One canonical library; per-user libraries are API projections |
| Writing to the import mount | It is the user's only copy until the import is all resolved |
| Image bytes in the web process | Workers write staging + manifest; the app reads the manifest |
| Image recompression, resize or grayscale on download | Destroys the bytes that verification and quality measurement read |
| Read-progress tracking and MAL / AniList sync | The app never sees a read; the reader owns read state |
| Full metadata editor UI | Becomes a second Komga; minimal override fields only |
| Auto-delete after read | Needs read state; one wrong delete loses a verified chapter |
| Torrent / usenet / indexer search | Different acquisition domain and legal profile |
| Story arcs and reading lists | Reader feature |
| Multi-tenant hosting or public sign-up | Multi-user, single-tenant |
| ML / OCR page classification | Fingerprint recurrence instead; OCR last and least |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (filled by the roadmapper) | | |

**Coverage:**
- v1 requirements: 59 total
- Mapped to phases: 0
- Unmapped: 59 ⚠️

---
*Requirements defined: 2026-11-02*
*Last updated: 2026-11-02 after initial definition*
