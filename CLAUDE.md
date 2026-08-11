# CLAUDE.md — Aizoban

Self-hosted manga download/library/metadata manager. **No reader** — output is CBZ + ComicInfo.xml
plus a Komga-compatible API. Planning stage; nothing implemented yet.

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

## Stack

Next.js + TypeScript + Postgres + `pg-boss`. Workers are separate processes.
