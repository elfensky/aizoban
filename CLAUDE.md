# CLAUDE.md — Aizoban

Self-hosted manga download/library/metadata manager. **No reader** — output is CBZ + ComicInfo.xml
plus a Komga-compatible API. **Phase 0 (de-risk) is measured and closed** — see `probes/phase-0/README.md`
for the numbers and `docs/decisions/` for what they decided. Current milestone: Phase 1 — skeleton.
No application code yet.

## Life cockpit

Tracked in the life-cockpit vault under `#personal` (tracker: `elfensky/aizoban`). The cockpit is
the control plane (what to work on); this repo is where the work happens. Report progress by
opening/closing issues and PRs as usual — the cockpit pulls from the tracker on its next `/sync`.
Nothing to update in the vault; don't mirror cockpit state (milestones, due dates) here.

## The two theses

Everything here is commodity except these. If a change makes one of them harder, it's the wrong
change.

1. **The Census.** Manga has no authoritative chapter list (unlike TV, where Sonarr gets one from
   TVDB). Sources *testify* about chapters; we arbitrate. Model it Work → Witness → Slot → Fill,
   never "chapters belonging to a source" — that inversion is the whole product.
2. **Verification without a reader.** Every chapter is checkable: page counts and perceptual
   hashes compared across sources. Nothing enters the library unverified when a second source
   exists.

## Hard rules

- **Image bytes never pass through the web process.** Workers write to staging with a manifest;
  the app reads the manifest, not the pixels.
- **Extensions are untrusted third-party code.** They run in a sandboxed process with no database
  and no filesystem. `node:vm` is *not* a security boundary.
- **Never bundle extensions.** Sources are added by the user at runtime from a repository URL,
  with provenance recorded. This is both a legal posture and a licence requirement — inkdex
  extensions are GPL-3.0.
- **Stage and atomically rename**, always. Kavita/Komga rescans race writes.
- **One canonical library on disk.** Per-user libraries are API projections scoped by key, never
  separate directories.
- **The import mount is read-only.** It is copied from, never written to. Never report an import
  "done" while anything is unresolved — the user deletes the source afterwards.
- **YAML site definitions carry config, never selectors.** Identity and capability are data;
  behaviour is code. Projects that ignored this rule died.

## Measured facts (Phase 0, 2026-08-13 — don't re-litigate without new data)

- **Acquisition is the JS worker only** — decision `docs/decisions/0001`. The Kotlin/Suwayomi
  half was deleted unbuilt; Suwayomi is the escape hatch behind the source-backend interface,
  with written switching triggers in the decision record.
- **Keep raw chapter labels alongside parsed numbers.** Witness parsers lie (converted MangaFox
  returns the *volume* as chapNum). Parsing is testimony, not truth.
- **Naive number matching silently misaligns renumbered witnesses** (per-season numbering makes
  different chapters "match"). Chapter identity claims need content verification, not just
  number agreement.
- **Page comparison must be content-aligned** (mutual nearest neighbour), never page-index-based,
  with template pages (recurring ads/credits) excluded first and a page-count guard for stitched
  webtoons. Validated pHash threshold ≈14 bits on 64-bit hashes.
- `@paperback/runtime-polyfills` has two known bugs to fix in any host: the interceptor chain
  passes the original request to every interceptor, and `formDidChange` is called but not
  implemented. Patch in `probes/phase-0/patches/`.

## Stack

Next.js + TypeScript + Postgres + `pg-boss`. Workers are separate processes:
`js-worker` (+ `solver` once the Cloudflare work lands) — nothing else, per decision 0001.
