# Aizoban

## What This Is

Aizoban (愛蔵版, "the treasured collector's edition") is a self-hosted manga download, library and
metadata manager with no reader. It runs the community extension ecosystem (Paperback 0.9 / inkdex)
on a server, works out what each downloaded chapter actually is, files it as CBZ + ComicInfo.xml in
one canonical library, and serves that library to the readers people already use (Kavita, Komga,
Paperback, Panels, Mihon) through a Komga-compatible API and OPDS/OPDS-PSE. It is for one household:
multi-user, single-tenant, one library on disk.

## Core Value

Every chapter in the library is the chapter it claims to be: the app builds its own chapter authority
from what sources testify (the Census: Work → Witness → Slot → Fill), and it verifies each chapter
across sources before it enters the library — because there is no reader to catch a wrong one.

## Requirements

### Validated

<!-- Phase 0 (de-risk) measured these on 2026-08-13 with probe scripts, not product code. -->

- ✓ A plain-Node Paperback 0.9 host runs the community corpus: 222/418 converted-Keiyoushi sources pass search → details → chapters → pages; zero failures were a missing host ABI — Phase 0 (#3)
- ✓ Ordinal drift is real and needs its own authority: 10.4% across 10 works × up to 10 sources; renumbering is invisible to naive number matching — Phase 0 (#1)
- ✓ Cross-source page verification works when content-aligned: pHash threshold 14 bits gives 1 miss / 121 and 0 false accepts / 2,896 — Phase 0 (#2)
- ✓ Acquisition is the project's own JS worker; the Kotlin/Suwayomi half is deleted unbuilt — Phase 0 (#4, decision 0001)

### Active

<!-- Phase 1 — skeleton (tracker milestone 2). Hypotheses until shipped. -->

- [ ] App scaffold: Next.js + TypeScript + Postgres (drizzle) + pg-boss, per-host job queues from day one, error taxonomy as protocol with per-class retry, content-rating filtering in the schema (#5)
- [ ] js-worker: hardened Paperback host with both polyfill bugs fixed, registry client (list/install/update/pin, bring-your-own repo URL with provenance + commit hash), per-extension persistent state, process boundary per extension (#6)
- [ ] Staging contract: worker writes a chapter + `manifest.json` to staging; the app validates the manifest, builds CBZ + ComicInfo.xml and lands it by stage + atomic rename; raw chapter labels kept verbatim (#7)
- [ ] `docker compose up` end to end: search → download one chapter → Kavita opens it, with a headless smoke script (#8)

<!-- Later phases (tracker milestones 3–9), in order. -->

- [ ] Recipes: a YAML recipe engine for the common CMS templates (Madara, MangaThemesia); config, never selectors; code escape hatch first-class
- [ ] Library: the Work / Witness / Slot / Fill schema; import of an existing library from a read-only mount, nothing reported done while unresolved
- [ ] Census: reconcile offset / split / interstitial / renumber drift into one canonical chapter list; evidence-based missing-chapter detection
- [ ] Assay: measure every page (dimensions, JPEG quality, upscale), fingerprint, compare across witnesses, quarantine on disagreement; credit/ad pages by fingerprint recurrence
- [ ] Readers: Komga `/api/v1` emulation (both `GET /api/v1/series` and `POST /api/v1/series/list`), then OPDS 1.2 + PSE 1.2
- [ ] Scale: a queue per site, aperture concurrency, typed failures with per-class retry, solver identity matching
- [ ] Polish: plugin-described settings forms, real sandboxing, multi-user polish, API keys, deployment, docs

### Out of Scope

- A reader — not now, not later; Kavita and Komga do it better
- Bundled extensions — sources are added by the user at runtime from a repository URL, with provenance recorded; legal posture, and inkdex extensions are GPL-3.0
- A Kotlin/Suwayomi acquisition backend in Phase 1 — deleted unbuilt by decision 0001; returns only if a written switching trigger fires
- Selectors in YAML site definitions — YAML carries identity and capability; behaviour is code (projects that ignored this rule died)
- Separate per-user library directories — one canonical library; per-user libraries are API projections scoped by key
- Writing to the import mount — it is read-only and copied from
- Image bytes in the web process — workers write to staging with a manifest; the app reads the manifest
- Multi-tenant hosting — multi-user, single-tenant
- ML for credit/ad page detection — fingerprint recurrence instead; OCR last and least

## Context

- **Repository state (2026-11-02):** no application code. The repo holds `README.md`, `AGENTS.md`
  (`CLAUDE.md` is a symlink to it), `docs/decisions/0001-acquisition-make-or-buy.md` and the Phase 0
  probes in `probes/phase-0/` (plain Node ESM `.mjs`, Node 26). No tests, lint, build or CI. The
  codebase map is in `.planning/codebase/`.
- **Tracker:** `elfensky/aizoban`. Milestones "Phase 0 — de-risk" (closed) and "Phase 1 — skeleton"
  … "Phase 8 — polish" (open). Only Phase 1 has issues (#5–#8). The GSD roadmap phases use the same
  numbers and names as the tracker milestones.
- **The theses:** (1) the Census — manga has no authoritative chapter list; sources testify, the app
  arbitrates; (2) verification without a reader — page counts and perceptual hashes compared across
  sources; nothing enters the library unverified when a second source exists.
- **Phase 0 findings the design carries:** witness parsers lie (converted MangaFox returns the volume
  as `chapNum`), so raw labels are kept beside parsed numbers. Identity drift precedes ordinal drift
  (9 of 70 search matches were the wrong series or edition). Page comparison must be content-aligned
  (mutual nearest neighbour), template pages excluded first, with a page-count guard for stitched
  webtoons. Aggregators often serve byte-identical files: cheap corroboration, not independent
  testimony.
- **Polyfill bugs:** `@paperback/runtime-polyfills` passes the original request to every interceptor
  (patch in `probes/phase-0/patches/`, applied by hand) and calls `formDidChange` without implementing
  it (stubbed in `probes/phase-0/host.mjs`).
- **Reuse:** issue #5 copies patterns from descent-app (`lib/jobs/` registry, drizzle setup, vitest
  layout, `mantine-datatable`); `r52/gagaku` (MIT) implements every polyfill gap and a FormManager.
- **Known concerns:** see `.planning/codebase/CONCERNS.md` (probe host is not a sandbox, the 10.4%
  exclusion step is not in the code, more witness parser defects than the README names).

## Constraints

- **Tech stack**: Next.js + TypeScript + Postgres + `pg-boss`; workers are separate processes: `js-worker` (+ `solver` once the Cloudflare work lands), nothing else — decision 0001
- **Runtime**: newest LTS line of Node (26) for app, workers, Docker bases and CI — Andrei's runtime rule
- **Security**: extensions are untrusted third-party code; they run in a sandboxed process with no database and no filesystem; `node:vm` is not a security boundary — hard rule
- **Data flow**: image bytes never pass through the web process; workers write to staging with a manifest — hard rule
- **Storage**: stage and atomically rename, always — Kavita/Komga rescans race writes
- **Library**: one canonical library on disk; the import mount is read-only and never reported "done" while anything is unresolved — the user deletes the source afterwards
- **Legal**: never bundle extensions; record provenance (repository URL + commit) — GPL-3.0 extensions and legal posture
- **Licence**: AGPL-3.0
- **Source identity**: key sources on (extension package, class name), never a numeric id — Mihon hashes ids from versionId, a bump orphans rows

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Acquisition on the project's own JS worker; no Suwayomi sidecar (decision 0001) | 65.5% of reachable sources pass; Cloudflare blocks a sidecar too; zero missing-ABI failures | ✓ Good (measured 2026-08-13) |
| Suwayomi stays the escape hatch behind a sidecar-shaped source-backend interface | Switching triggers: reachable pass rate < 60% for a month after the solver ships, or PaperbackExt unmaintained ≥ 6 months with > 20% broken | — Pending |
| Keep raw chapter labels alongside parsed numbers | Parsing is testimony, not truth (MangaFox volume-as-chapNum) | ✓ Good |
| Content-aligned page comparison, pHash threshold ≈ 14 bits | Index-based comparison does not separate; aligned comparison does | ✓ Good |
| Job queues per host from day one (`singletonKey` on source domain) | Retrofitting in Phase 7 would touch every job definition | — Pending |
| GSD roadmap phases mirror the tracker milestones (Phase 1 … Phase 8) | One plan, two views: the tracker and the roadmap must not drift | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-02 after initialization*
