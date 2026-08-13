// aizoban#1 — pull full chapter lists for each work × source, save as fixtures.
// Raw labels kept verbatim: the messiness IS the data. Resumable per (work, source).
//   node fetch-chapters.mjs [--only work-key] [--source SourceId]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadExtension, withTimeout } from './host.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'works.json'), 'utf8'))
const args = process.argv.slice(2)
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null }
const ONLY_WORK = arg('only'), ONLY_SOURCE = arg('source')
const FIXTURES = path.join(DIR, 'fixtures', 'chapters')
const BUNDLES = path.join(DIR, 'bundles')
fs.mkdirSync(FIXTURES, { recursive: true })
fs.mkdirSync(BUNDLES, { recursive: true })

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

async function bundle(sourceId, registry) {
  const file = path.join(BUNDLES, `${sourceId}.js`)
  if (!fs.existsSync(file)) {
    const res = await fetch(`${registry}/${sourceId}/index.js`)
    if (!res.ok) throw new Error(`bundle HTTP ${res.status}`)
    fs.writeFileSync(file, await res.text())
  }
  return fs.readFileSync(file, 'utf8')
}

function pickMatch(items, work) {
  const wanted = [work.title, ...(work.aliases ?? [])].map(norm)
  const scored = items.map(it => {
    const t = norm(it.title)
    let score = 0
    if (wanted.includes(t)) score = 3
    else if (wanted.some(w => t.startsWith(w) || w.startsWith(t))) score = 2
    else if (wanted.some(w => t.includes(w) || w.includes(t))) score = 1
    return { it, score }
  }).sort((a, b) => b.score - a.score)
  return scored[0]?.score >= 2 ? scored[0].it : null // contains-only matches produced impostors
}

for (const [sourceId, { registry }] of Object.entries(cfg.sources)) {
  if (ONLY_SOURCE && sourceId !== ONLY_SOURCE) continue
  let ext
  try {
    ext = await loadExtension(await bundle(sourceId, registry), sourceId)
  } catch (err) {
    console.error(`SKIP source ${sourceId}: ${err.message}`)
    continue
  }
  for (const work of cfg.works) {
    if (ONLY_WORK && work.key !== ONLY_WORK) continue
    const out = path.join(FIXTURES, `${work.key}--${sourceId}.json`)
    if (fs.existsSync(out)) { console.error(`have ${work.key} × ${sourceId}`); continue }
    try {
      const paged = await withTimeout(
        ext.getSearchResults({ title: work.title, filters: [] }, undefined, undefined), 45_000, 'search')
      const hit = pickMatch(paged?.items ?? [], work)
      if (!hit) { console.error(`MISS ${work.key} × ${sourceId}: no title match in ${(paged?.items ?? []).length} hits`); continue }
      const details = await withTimeout(ext.getMangaDetails(hit.mangaId), 45_000, 'details')
      const sourceManga = details?.mangaId ? details : { mangaId: hit.mangaId, mangaInfo: details }
      const chapters = await withTimeout(ext.getChapters(sourceManga), 90_000, 'chapters')
      fs.writeFileSync(out, JSON.stringify({
        work: work.key, source: sourceId,
        matchedTitle: hit.title, mangaId: hit.mangaId,
        fetchedAt: new Date().toISOString(),
        chapters: (chapters ?? []).map(c => ({
          chapterId: c.chapterId, chapNum: c.chapNum, volume: c.volume ?? null,
          title: c.title ?? null, version: c.version ?? null, langCode: c.langCode ?? null,
          sortingIndex: c.sortingIndex ?? null,
          publishDate: c.publishDate ? new Date(c.publishDate).toISOString() : null,
        })),
      }, null, 1))
      console.error(`OK   ${work.key} × ${sourceId}: "${hit.title}" — ${chapters.length} chapters`)
    } catch (err) {
      console.error(`FAIL ${work.key} × ${sourceId}: ${String(err.message).slice(0, 160)}`)
    }
  }
}
