---
gsd_state_version: '1.0'
status: planning
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-02)

**Core value:** Every chapter in the library is the chapter it claims to be: the app builds its own chapter authority from what sources testify (the Census), and verifies each chapter across sources before it enters the library.
**Current focus:** Phase 1 — skeleton

## Current Position

Phase: 1 of 8 (skeleton)
Plan: 0 of TBD in current phase
Status: Not started. Ready to plan. No application code yet; the de-risk milestone (tracker milestone 1) closed 2026-08-13.
Last activity: 2026-11-02 — Roadmap created (8 phases, 59/59 v1 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [De-risk, 2026-08-13]: Acquisition runs on the project's own JS worker; no Suwayomi sidecar (decision 0001)
- [Roadmap]: Phases 1 to 8 mirror tracker milestones 2 to 9, same numbers and names
- [Roadmap]: Sandbox basics, the pass-rate canary and the quarantine review screen are pulled earlier than their tracker phase (Phases 1, 2, 5)

### Pending Todos

None yet.

### Blockers/Concerns

Open owner decisions (from research/SUMMARY.md "Open Questions for the Owner"). None blocks starting Phase 1 planning, but the first one blocks issue #7.

- [Phase 1, issue #7] **Which process builds the CBZ?** Most urgent. Issue #7 says "the app builds CBZ", but building reads every page byte, which breaks the "bytes never in web" rule. Options: an ingest role in the same image with different mounts, or `js-worker` parent via pg-boss. Decision 0001 says workers are `js-worker` and `solver` only, so a short ADR is needed either way. The same answer decides where Phase 5 fingerprinting runs.
- [Phase 6] **How are page bytes served under "image bytes never pass through the web process"?** Komga page/file endpoints and PSE must return image bytes. Options: (a) narrow the rule to acquisition bytes and stream landed files from a read-only mount; (b) reverse-proxy hand-off (`X-Accel-Redirect`); (c) a small media process. (a) and (b) change the `AGENTS.md` wording; (c) adds a role beyond decision 0001.
- [Phase 3] **Where does provider metadata live (LIB-06)?** Needed before the Phase 3 schema freeze. Choose the first provider (MangaUpdates, AniList or MangaBaka) and a field-level provenance and "locked by user" design.
- [Phase 1] **Per-host concurrency design (FOUND-02).** `group` + `groupConcurrency` versus a queue per host. The Phase 1 spike decides; pin pg-boss exactly.
- [Phase 4] **Slot id stability across Census re-runs.** Needs a matching rule and a file-rename policy so Fill ids and Komga book ids never change. The Phase 1 opaque Slot id must allow it.
- [Phase 4 start] **Phase 6 relative to Phases 4 and 5.** Run in parallel for earlier household value, or keep the order.
- [Phase 1] **Small clarifications.** Correct "64-bit" to "63-bit" in `AGENTS.md` (or change the hash); Biome versus adding ESLint for Next-specific rules.
- [Phase 8, before public release] Legal read on GPL-3.0 extensions loaded at runtime inside an AGPL host, and on the converted registry used in the de-risk probes.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-02
Stopped at: Roadmap created; ready to plan Phase 1
Resume file: None
