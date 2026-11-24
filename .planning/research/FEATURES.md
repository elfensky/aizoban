# Feature Research

**Domain:** Self-hosted manga download / library / metadata manager, no reader (feeds Kavita, Komga, Paperback, Panels, Mihon)
**Researched:** 2026-11-02
**Confidence:** MEDIUM. Competitor feature lists come from project READMEs (HIGH for what they claim, MEDIUM for how well it works). Komga API surface, Komf compatibility with an emulated API, and Suwayomi duplicate-chapter behaviour were not verified (LOW) and are flagged for phase research.

## Landscape Summary

The category splits into four tool types. Aizoban spans three of them and adds one that does not exist.

| Tool type | Examples | What it does | What it lacks |
|-----------|----------|--------------|---------------|
| Acquirer | Suwayomi-Server, Tranga, Kaizoku (archived 2025-02-03), mangal | Source search, follow, scheduled check, download, CBZ | Any opinion on what a chapter *is*; any check that the download is right |
| Metadata enricher | Komf, MetaKavita | Match series to MangaUpdates / AniList / MangaBaka etc., write ComicInfo, covers | Works on the reader's library after the fact; does not touch acquisition |
| Reader / library server | Kavita, Komga | Scan folders, serve, track reads | Does not acquire; trusts the files and the ComicInfo it is given |
| Arr-style manager (comics) | Mylar3, Kapowarr | Monitor series against an authoritative issue list (ComicVine), find missing, rename, tag | Needs an authoritative list. Manga has none |

The gap Aizoban fills: acquisition plus metadata plus arr-style "missing" detection, for a domain with no authoritative list, with a verification step because no reader sits in the loop.

## Feature Landscape

### Table Stakes (Users Expect These)

Complexity: LOW = days, MEDIUM = 1-2 weeks, HIGH = multi-week or research risk. "Phase" uses the roadmap numbering from PROJECT.md (1 skeleton, 2 recipes, 3 library, 4 census, 5 assay, 6 readers, 7 scale, 8 polish).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Install / update / pin sources from a user-supplied repository URL, with provenance | Suwayomi's core loop (Mihon extensions). Users bring their own repo. Also the legal posture | MEDIUM | Phase 1. Record repo URL + commit hash. Key sources on (package, class), never a numeric id |
| Search a source, browse series details and chapter list | Every acquirer has it | LOW | Phase 1. Host already proven by Phase 0 (222/418 pass) |
| Follow ("monitor") a series | Suwayomi library, Tranga monitor, Kapowarr monitored volumes. The unit of automation | LOW | Phase 3 (Work). Needs a Work entity, not a source-bound row |
| Scheduled new-chapter check | Tranga default 3 h; Suwayomi update interval | LOW | pg-boss recurring job per Work. Per-host queue from day one |
| Auto-download new chapters + manual "download this chapter / range" | Suwayomi, Tranga | LOW | Phase 1 manual, Phase 3 auto |
| Download queue with status, retry, pause, cancel, per-class failure reason | Suwayomi has a queue; Tranga has timeouts and rate caps (90 req/min). Silent failure is the top complaint of the class | MEDIUM | Typed error taxonomy is already planned (Phase 1/7). Queue UI is the visible half |
| Per-host rate limiting and concurrency cap | Sites ban fast clients. Tranga hard-codes a request cap | MEDIUM | `singletonKey` on source domain (Phase 1); aperture tuning Phase 7 |
| Cloudflare handling | Suwayomi and Tranga both lean on FlareSolverr. Without it a large share of sources fail | HIGH | Phase 7 `solver` worker. Identity matching (UA / TLS / IP) is the hard part |
| CBZ + ComicInfo.xml output | Tranga and Suwayomi both do it; Kavita and Komga read ComicInfo and let it override filename parsing | LOW | Phase 1. Kavita needs the file named exactly `ComicInfo.xml` at archive root |
| Predictable naming / one folder per series | Kavita requires each series in its own folder, no files at library root; it parses filenames for volume/chapter (`v01`, `c012`) | LOW | Phase 1 / 3. Pick one canonical template; test against both Kavita and Komga scanners |
| Atomic landing (stage then rename) | Reader rescans race writes; a half-written CBZ is indexed as corrupt | LOW | Hard rule. Phase 1 |
| Series metadata from external providers (title, alt titles, summary, status, genres, cover) | Komf exists because acquirers do not do this; readers look bare without it | MEDIUM | Phase 3. Providers behind one interface; first set MangaUpdates, AniList, MangaBaka. Per-field priority fill like Komf's aggregation. Provider matching is itself identity work (9/70 search matches were wrong series) |
| Reader integration: Komga-compatible API and OPDS / OPDS-PSE | Suwayomi ships OPDS + PSE at `/api/opds/v1.2`. Mihon/Komga users expect a Komga-shaped API | HIGH | Phase 6. Both `GET /api/v1/series` and `POST /api/v1/series/list`. Exact endpoint set used by Mihon's Komga extension not verified (see Gaps) |
| Optional "scan this library now" ping to Kavita / Komga | Tranga does it after new chapters land | LOW | Phase 6/8. Kavita and Komga both expose a scan call. Nice with atomic rename, still expected |
| Notifications on new chapter / failure | Tranga (Gotify, ntfy, LunaSea, webhooks); Komf (Discord, Apprise) | LOW | Phase 8. One generic webhook + Apprise URL covers all |
| Multi-user with API keys, scoped views | Komga/Kavita users run a household; Komga accepts `X-API-Key` | MEDIUM | Phase 6/8. One canonical library on disk; users are projections |
| Content-rating filtering per user | Source ecosystems carry NSFW sources; household use needs a guard | MEDIUM | Schema field in Phase 1; enforcement in Phase 6 projections. Cheap now, a migration later |
| Single-command deployment (`docker compose up`) with a smoke script | Every competitor ships Docker; Kaizoku needed Postgres + Redis, Tranga Postgres | MEDIUM | Phase 1 (#8) |
| Import an existing library without loss | Users already own a folder of CBZ/CBR. Tranga/Suwayomi do not do this well | HIGH | Phase 3. Read-only mount; never report done while anything is unresolved |
| Source health view (last pass/fail per extension, breaking-change flag) | Extensions break constantly; Suwayomi users find out by missing chapters. Pass rate (65.5%) is a switching trigger in decision 0001, so it must be measured anyway | MEDIUM | Phase 7. Measurement can land in Phase 1 as job-result telemetry |
| Backup / restore of own state | Suwayomi has automated backups | LOW | Phase 8. Postgres dump + source/provenance export. The library on disk is the other half |

### Differentiators (Competitive Advantage)

These follow the two theses. No surveyed product does any of them.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Census: Work -> Witness -> Slot -> Fill model | A canonical chapter list that exists independently of any source. Sources testify, the app arbitrates. Everything below depends on it | HIGH | Phase 3 schema, Phase 4 logic. Never model "chapters belonging to a source" |
| Drift reconciliation: offset, split (45.1/45.2), interstitial (45.5), renumber (Part 2 restarts) | Five sites saying "chapter 45" can mean five chapters. 10.4% ordinal drift measured; naive number matching is blind to renumbering | HIGH | Phase 4. Content evidence (page hashes) is required for renumber detection, not just number agreement. Raw label kept beside parsed number |
| Evidence-based "missing chapter" detection | Sonarr can say "episode 7 missing" because TVDB exists. Here the claim must cite witnesses ("3 of 5 sources list a slot we hold no Fill for") | HIGH | Phase 4. Needs Census; emits a confidence, not a boolean |
| Cross-source verification: page count + content-aligned pHash, quarantine on disagreement | Replaces the human who would have opened the file. Measured: 1 miss / 121, 0 false accepts / 2,896 at 14-bit threshold | HIGH | Phase 5. Mutual nearest neighbour, template pages excluded first, page-count guard for stitched webtoons |
| Nothing enters the library unverified when a second source exists | Turns verification from a report into a gate | MEDIUM | Phase 5. Single-source chapters get an explicit "unverified" state, not a silent pass |
| Quarantine with review queue and explicit accept / reject / swap-witness actions | Gives the gate a human exit; arbitration will sometimes be wrong | MEDIUM | Phase 5. Also the manual override path for Census (merge / split slots, pin witness). Treat as required, not optional |
| Per-page quality measurement (dimensions, real JPEG quality, upscale detection) | Lets the app pick the better of two verified Fills and report "this chapter is an upscale" | HIGH | Phase 5 |
| Quality-based Fill upgrade (Sonarr-style upgrade) | When a better verified Fill appears, replace atomically. No manga tool does this | MEDIUM | Phase 5+. Depends on quality measurement + verified equality of content |
| Credit / ad page detection by fingerprint recurrence | Separates story pages from scanlation credits and ads without ML | MEDIUM | Phase 5. Same recurrence logic feeds the "template pages excluded first" step of comparison |
| Provenance trail per chapter (which witness, which extension commit, which hashes agreed) | Answers "why is this chapter here?" months later. Competitors keep no such record | MEDIUM | Falls out of Census + Assay data; needs a read view. Phase 5/8 |
| Byte-identical aggregator detection (corroboration is not independent testimony) | Prevents two mirrors of one scanlation from counting as "verified by 2 sources" | MEDIUM | Phase 5. Phase 0 finding |
| Mihon backup import (follows only, not read state) | Cheap migration path from Suwayomi / Mihon users; seeds Works | MEDIUM | Phase 8. Adoption feature, not core. Package/class identity mapping needed |
| Declarative recipes for common CMS templates (Madara, MangaThemesia) as YAML identity + capability, code escape hatch | Covers sources with no extension. Paste a URL, it configures | HIGH | Phase 2. Config, never selectors |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Built-in reader | "Why not just read it here?" | Out of scope permanently. Kavita and Komga do it better. Doubles the surface | Komga API + OPDS-PSE to the reader the user already has |
| Bundled extensions / default source list | Easier first run | Legal posture and GPL-3.0 inkdex licence. Provenance would be lost | User adds repo URL at runtime; docs say how |
| Image recompression, resize, grayscale on download (Tranga offers JPEG compress and B/W) | Saves disk, e-ink | Destroys the bytes that verification hashes and quality measurement read; irreversible | Store original bytes. Do any conversion as a derived view at serve time (reader or API layer), never on disk |
| Per-user library directories | "Each user has their own folder" | Duplicated bytes, divergent state, rescans race. Violates one-canonical-library | Per-user API projections scoped by key |
| Selectors in YAML site definitions | Fast way to add a site | Projects that did this died: config rots into a bad scripting language | YAML = identity + capability. Behaviour in code |
| ML / OCR page classification for credits and ads | Sounds accurate | Heavy dependency, brittle, hard to explain. Not needed for the stated job | Fingerprint recurrence; OCR last and least |
| Read-progress tracking and MAL / AniList sync (Suwayomi, Komf-rs do it) | Common request from Mihon users | Aizoban never sees a read. Duplicates the reader's job and two sources of truth for "read" fight | Readers sync their own progress. If Komga progress endpoints are emulated for compatibility, store and pass through only |
| Full metadata editor UI | Users want to fix a title | Becomes a second Komga. Large UI cost | Minimal override fields on Work (title, provider id, status). Komga/Kavita edit the rest |
| Auto-delete after read | Disk pressure | Needs read state (see above); one wrong delete loses a verified chapter | Disk-usage view plus manual prune |
| Torrent / usenet / indexer search (Mylar3, Kapowarr model) | Familiar arr pattern | Different acquisition domain, different legal profile, different failure modes | Stay with source extensions |
| Story arcs and reading lists (Mylar3 deprecated its own) | Comic users ask | Reader feature; Mylar3's maintainers call it deprecated | Defer to Kavita / Komga reading lists |
| Anonymous multi-tenant hosting / public sign-up | "Share with friends" | Different security and legal model | Single tenant, multi-user household |
| Writing to the import mount (move / delete after import) | "Clean up for me" | Destroys the user's only copy before the app proves it is whole | Copy only. User deletes the source after an all-resolved report |
| Trusting `node:vm` as the extension sandbox | Fast to build | Not a security boundary | Separate sandboxed process, no DB, no filesystem (Phase 8 hardening; process boundary from Phase 1) |
| Pushing image bytes through the Next.js process | Simpler code path | Hard rule; memory and latency blow up | Worker writes to staging with manifest; app reads the manifest |

## Feature Dependencies

```
Source registry (repo URL + provenance)
    └──requires──> js-worker host (polyfill fixes, process boundary)
                       └──requires──> Staging contract (manifest.json)
                                          └──requires──> CBZ + ComicInfo writer (stage + atomic rename)

Work / Witness / Slot / Fill schema
    └──requires──> Raw chapter labels kept verbatim (Phase 1 staging)
    └──requires──> Source identity (package, class)

Follow + scheduled check + auto-download
    └──requires──> Work entity (Phase 3)
    └──requires──> Per-host queues + typed error taxonomy (Phase 1)

Library import (read-only mount)
    └──requires──> Work/Slot/Fill schema
    └──requires──> Page hashing (Assay) to claim "resolved"

Census drift reconciliation
    └──requires──> Work/Witness/Slot/Fill schema
    └──requires──> Page fingerprints (renumber detection needs content evidence)

Evidence-based missing detection ──requires──> Census

Cross-source verification + quarantine
    └──requires──> Page fingerprinting (pHash, content-aligned)
    └──requires──> Template-page exclusion (recurrence)
    └──requires──> Two or more Witnesses for the same Slot

Quality-based Fill upgrade
    └──requires──> Per-page quality measurement
    └──requires──> Verified content equality between old and new Fill

Komga API / OPDS-PSE
    └──requires──> Canonical library + provider metadata + API-key user scoping
    └──requires──> Content-rating filtering in schema

Provider metadata ──enhances──> Census (volume boundaries, expected count, status)
Provider metadata ──enhances──> Library import (match existing folders to Works)
Credit-page detection ──enhances──> Cross-source verification
Source health view ──enhances──> Scale (switching triggers in decision 0001)
Recipes (YAML) ──enhances──> Source registry (more sources, same host contract)

Image recompression ──conflicts──> Verification and quality measurement
Per-user directories ──conflicts──> One canonical library
Read-progress sync ──conflicts──> Reader owns read state
```

### Dependency Notes

- **Census requires fingerprints:** the Phase 0 result that renumbering is invisible to number matching means Phase 4 cannot be built on labels alone. Either Phase 5's fingerprinting lands first for the comparison primitive, or Phase 4 ships a number-only first cut that is flagged "unverified". Roadmap should decide; recommendation: build the page-fingerprint primitive (hash + content-aligned compare) as a shared library early, use it in Phase 4 and 5.
- **Import requires Assay:** "never report done while anything is unresolved" cannot be honoured without a way to decide whether an imported file equals a Slot's Fill. Import in Phase 3 can ship in a "copied, unresolved" state, with resolution arriving in Phase 4/5.
- **Reader API requires scoping and rating filters:** retrofitting per-user projection onto an API already in use is a breaking change. Keep the schema fields from Phase 1.
- **Quarantine UI is shared infrastructure:** Census manual arbitration and verification review use the same list/detail/action pattern. Build once.
- **Notifications and library-scan pings** depend on a job-event stream only. They can slip to any phase without blocking others.

## MVP Definition

### Launch With (v1: Phases 1-3, minimum that proves the loop)

- [ ] Registry + js-worker + staging contract + CBZ/ComicInfo writer (Phase 1). This is the "search, download one chapter, Kavita opens it" proof
- [ ] Follow a series, scheduled check, auto-download, queue with typed failures (Phase 3, with Phase 1 queue). Without it the app is a one-shot downloader
- [ ] Work/Witness/Slot/Fill schema with raw labels (Phase 3). Later phases cannot be added without a migration if this is wrong
- [ ] One provider (MangaUpdates or AniList) for series metadata and cover (Phase 3). Readers look empty otherwise
- [ ] Per-host queues, rate caps, content-rating field in schema (Phase 1). Cheap now, costly to retrofit

### Add After Validation (v1.x: Phases 4-6, the theses)

- [ ] Census drift reconciliation + evidence-based missing list (Phase 4). Trigger: schema stable, fingerprint primitive available
- [ ] Assay: verification gate, quarantine queue, quality measurement, credit-page detection (Phase 5). Trigger: Phase 4 slots exist
- [ ] Komga API (both series endpoints) then OPDS/PSE (Phase 6). Trigger: a library worth serving
- [ ] YAML recipes for Madara / MangaThemesia (Phase 2, can float). Trigger: sources demanded that no extension covers

### Future Consideration (v2+: Phases 7-8)

- [ ] Cloudflare solver with identity matching, aperture concurrency, source health dashboard (Phase 7). Defer until measured pass rate says it pays; decision 0001 sets the < 60% trigger
- [ ] Notifications, library-scan pings, backup, Mihon backup import, API-key UI, real sandbox hardening (Phase 8)
- [ ] Quality-based Fill upgrade. Defer until Assay measurements prove trustworthy
- [ ] Additional providers (more than 3). Defer until the first provider interface is proven

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Source registry + install/pin with provenance | HIGH | MEDIUM | P1 |
| js-worker host, process boundary | HIGH | HIGH | P1 |
| Staging manifest + atomic CBZ/ComicInfo landing | HIGH | MEDIUM | P1 |
| Follow + schedule + auto-download | HIGH | LOW | P1 |
| Queue with typed failures, per-host limits | HIGH | MEDIUM | P1 |
| Work/Witness/Slot/Fill schema | HIGH | MEDIUM | P1 |
| Provider metadata (1 provider) | HIGH | MEDIUM | P1 |
| Docker compose + smoke script | HIGH | MEDIUM | P1 |
| Census drift reconciliation | HIGH | HIGH | P1 (thesis) |
| Cross-source verification + quarantine | HIGH | HIGH | P1 (thesis) |
| Evidence-based missing detection | HIGH | HIGH | P2 |
| Komga API + OPDS/PSE | HIGH | HIGH | P1 (without it nothing reads the library) |
| Library import | HIGH | HIGH | P2 |
| Per-page quality measurement | MEDIUM | HIGH | P2 |
| Credit/ad page detection | MEDIUM | MEDIUM | P2 |
| YAML recipes | MEDIUM | HIGH | P2 |
| Cloudflare solver | HIGH | HIGH | P2 (pass-rate dependent) |
| Source health dashboard | MEDIUM | MEDIUM | P2 |
| Multi-user, API keys, rating filter enforcement | MEDIUM | MEDIUM | P2 |
| Notifications | LOW | LOW | P3 |
| Scan pings to Kavita/Komga | LOW | LOW | P3 |
| Backup / Mihon backup import | MEDIUM | MEDIUM | P3 |
| Quality-based Fill upgrade | MEDIUM | MEDIUM | P3 |
| Provenance trail view | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch or a thesis
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Suwayomi-Server | Tranga | Kaizoku (archived) | Komf | Mylar3 / Kapowarr | Aizoban plan |
|---------|-----------------|--------|--------------------|------|-------------------|--------------|
| Sources | Mihon extensions (Kotlin, JVM) | 4 built-in connectors (MangaDex, MangaWorld, AsuraComic, WeebCentral) | via mangal | none | indexers / ComicVine | Paperback/inkdex extensions in a JS worker + YAML recipes |
| Follow + scheduled check | yes, update interval | yes, 3 h default | basic | n/a | yes (pull list, monitored) | yes, per-Work |
| Auto-download | yes | yes | yes | n/a | yes | yes |
| Output | folders or optional CBZ | CBZ + optional ComicInfo.xml | folders | writes ComicInfo to reader library | CBZ/CBR + ComicInfo | CBZ + ComicInfo.xml, stage + atomic rename |
| Cloudflare | FlareSolverr | FlareSolverr | no | n/a | n/a | own solver worker (Phase 7) |
| Chapter authority | none; trusts one source | none | none | none | ComicVine issue list | Census |
| Missing detection | source-list diff only | none | none | none | vs ComicVine | evidence-based against witnesses |
| Post-download verification | none | none | none | none | none | cross-source page count + pHash, quarantine |
| Metadata | tracker links (MAL, AniList, MangaUpdates, Bangumi, Kitsu) | source + enrichment, ComicInfo | AniList tag | 14 providers, priority, per-library, aggregation | ComicVine (key needed for most features) | Providers behind one interface, per-field fill |
| Reader serving | OPDS + PSE, own WebUI | scan trigger to Komga/Kavita | none | n/a | Kavita guide for ComicInfo | Komga API + OPDS/PSE, no UI reader |
| Notifications | no | Gotify, ntfy, LunaSea, REST | no | Discord, Apprise | yes | webhook + Apprise (Phase 8) |
| Tracker sync | MAL, AniList, MangaUpdates | no | no | OAuth sync in Rust fork | no | none (anti-feature) |
| Backup | Mihon-compatible, automated | n/a | n/a | n/a | n/a | own state dump; Mihon import (follows only) |
| Maintenance | active | active (v2, .NET 10) | archived 2025-02-03; author recommends Suwayomi + Komf | active (+ Rust fork) | Mylar3 active; story arcs deprecated | n/a |

## Gaps to Verify in Phase Research

- **Komga API surface for Mihon:** which endpoints the Mihon Komga extension and Kavita-side tools call (series list, books, pages, thumbnails, read progress, SSE) was not found. Phase 6 needs this from the extension source or Komga's OpenAPI. LOW confidence on anything stated about it here.
- **Komf against an emulated Komga API:** Komf listens for new entries and writes metadata through Komga's API. Whether Aizoban should support that or own all metadata writing is undecided. Recommendation: own metadata writing (ComicInfo + API fields) and treat Komf compatibility as best-effort. Unverified.
- **Suwayomi duplicate / multi-scanlator handling:** no source found. Matters for how Witness differs from a Suwayomi "chapter". Check Suwayomi issues for "scanlator" and "duplicate" during Phase 4 research.
- **Provider terms and rate limits** (MangaUpdates, AniList, MangaBaka; MangaBaka has an API mode and a database mode): not examined. Needed before Phase 3 provider work.
- **Volume mapping:** Kavita and Komga show volumes; manga is often chapter-only on sources. Whether Census should map chapters to volumes from provider data is open. Tranga offers a volume-in-filename option. Defer, but keep the Slot schema able to carry a volume.

## Sources

- [Suwayomi-Server README](https://github.com/Suwayomi/Suwayomi-Server) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4349): extensions, library categories, auto-update, auto-download, trackers, Mihon-compatible backup, FlareSolverr, OPDS/PSE at `/api/opds/v1.2` (HIGH for claims, README)
- [Suwayomi-Server releases](https://github.com/Suwayomi/Tachidesk-Server/releases): CBZ download support from v0.7.0, Bangumi and Kitsu trackers (MEDIUM)
- [Tranga](https://github.com/C9Glax/tranga) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4352): connectors, 3 h check default, 90 req/min cap, notification targets, Komga/Kavita scan trigger, ComicInfo option, JPEG/B&W conversion, REST API only (HIGH for claims)
- [Kaizoku](https://github.com/oae/kaizoku) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=18): archived 2025-02-03, recommends Suwayomi for downloads and Komf for metadata (HIGH)
- [Komf](https://github.com/Snd-R/komf) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=15): providers, per-library priority, aggregation, ComicInfo update mode, event listener, notifications (HIGH for claims)
- [Komf-rs](https://hub.docker.com/r/dyphire/komf-rs) and [Komf wiki](https://github.com/Snd-R/Komf/wiki): provider table (MangaUpdates, AniList, MangaBaka, MAL, MangaDex, others), OAuth tracker sync in the Rust fork (MEDIUM)
- [Kavita wiki, comics metadata](https://wiki.kavitareader.com/guides/metadata/comics/), [general metadata](https://wiki.kavitareader.com/guides/metadata/general/), [flexible scanner](https://wiki.kavitareader.com/guides/scanner/comic/), [managing files](https://wiki.kavitareader.com/guides/scanner/managefiles/): `ComicInfo.xml` at archive root overrides filenames, `v01` / `c01` filename patterns, one folder per series (HIGH)
- [Mylar3 community listings](https://community-scripts.org/scripts/mylar3?id=mylar3) and [Kavita Mylar guide](https://wiki.kavitareader.com/guides/3rdparty/mylar/): pull list, missing-issue fetch, rename formats, story arcs deprecated, ComicVine key needed (MEDIUM; third-party descriptions)
- [Kapowarr (Hostinger listing)](https://www.hostinger.com/uk/applications/kapowarr): monitored volumes, one-click and manual search, format conversion (LOW; marketing page)
- Project inputs: `.planning/PROJECT.md`, `README.md`, `AGENTS.md` (Phase 0 measured facts)

---
*Feature research for: self-hosted manga download / library / metadata manager (no reader)*
*Researched: 2026-11-02*
