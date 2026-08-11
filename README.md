# Aizoban

**愛蔵版** — *the treasured collector's edition.* 愛 treasure + 蔵 storehouse + 版 edition.

A self-hosted manga **download, library and metadata manager**. It deliberately has **no reader** —
reading happens in Kavita, Komga, Paperback, Panels or Mihon. Aizoban acquires chapters, works out
what they actually are, files them properly, and serves them to whatever reader you already use.

> Status: **planning.** Nothing is implemented yet.

## Why this exists

Sonarr can ask "am I missing episode 7?" because TVDB publishes a definitive episode list. **Manga
has no such authority.** The tracker counts the Japanese volumes; scanlation groups number things
however they like — splitting chapter 45 into 45.1 and 45.2, slipping a bonus story in as 45.5, or
retroactively renumbering a whole run when the series restarts as Part 2.

So five sites listing "chapter 45" can mean five different things. **Building that missing
authority is the point of this project;** downloading is the easy part.

The second problem follows from having no reader. Normally you catch a bad download instantly —
you open it and the pages are wrong. Without a reader, a corrupt or misidentified chapter sits in
your library looking fine until you trip over it months later. So Aizoban verifies its own work:
when a chapter is available from more than one source, it samples pages from each and compares
them.

## What it does

- Runs community source plugins (Paperback/inkdex today) plus its own declarative YAML site
  definitions for the common CMS templates — paste a URL, it works out the template and configures
  itself
- Reconciles chapter numbering across sources into a single canonical list, handling split,
  extra, offset and retroactively-renumbered chapters
- Verifies chapters by comparing page counts and perceptual hashes across sources — catching
  wrong-series matches, machine-translated re-uploads and placeholder "Loading…" pages
- Measures image quality per page: real JPEG quality, resolution, upscale detection
- Tells story pages apart from scanlation credit pages and ads
- Writes **CBZ + ComicInfo.xml** into one canonical library
- Serves a **Komga-compatible API** and **OPDS/OPDS-PSE**, so existing readers connect with no
  extension written by us
- Multi-user, single-tenant: one library on disk, per-user views scoped by API key

## Non-goals

- **A reader.** Not now, not later. Kavita and Komga are better at it.
- **Bundling extensions.** Source repositories are added by the user at runtime, never shipped.

## Licence

[AGPL-3.0](LICENSE).
