// aizoban#2 refinement — fetch EVERY page of one chapter from paired sources,
// so same-content ground truth comes from alignment, not page index.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadExtension, withTimeout } from './host.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(DIR, 'fixtures', 'pages-full')
fs.mkdirSync(OUT, { recursive: true })

const REG_NICART = 'https://nicartjay.github.io/PaperbackExt/0.9/stable'
const REG_INKDEX = 'https://inkdex.github.io/extensions/0.9/stable'
const REGISTRY = { WeebCentral: REG_INKDEX }
const REFERER = {
  WeebCentral: 'https://weebcentral.com/', MangaFreak: 'https://ww2.mangafreak.me/',
  MangaPill: 'https://mangapill.com/', Mangatown: 'https://www.mangatown.com/',
}
const TARGETS = [
  { key: 'kingdom', title: 'Kingdom', ch: 700, sources: ['WeebCentral', 'MangaFreak'] },
  { key: 'jujutsu-kaisen', title: 'Jujutsu Kaisen', ch: 236, sources: ['WeebCentral', 'MangaFreak', 'MangaPill'] },
  { key: 'berserk', title: 'Berserk', ch: 364, sources: ['WeebCentral', 'Mangatown', 'MangaFreak'] },
]

const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
const extCache = {}
async function getExt(id) {
  if (extCache[id]) return extCache[id]
  const code = await (await fetch(`${(REGISTRY[id] ?? REG_NICART)}/${id}/index.js`)).text()
  return (extCache[id] = await loadExtension(code, id))
}

for (const t of TARGETS) {
  for (const sourceId of t.sources) {
    try {
      const ext = await getExt(sourceId)
      const paged = await withTimeout(ext.getSearchResults({ title: t.title, filters: [] }, undefined, undefined), 45_000, 'search')
      const hit = (paged?.items ?? []).find(i => norm(i.title) === norm(t.title))
      if (!hit) { console.error(`MISS ${t.key} × ${sourceId}`); continue }
      const details = await withTimeout(ext.getMangaDetails(hit.mangaId), 45_000, 'details')
      const sm = details?.mangaId ? details : { mangaId: hit.mangaId, mangaInfo: details }
      const chapters = await withTimeout(ext.getChapters(sm), 90_000, 'chapters')
      const chapter = chapters.find(c => Math.abs(Number(c.chapNum) - t.ch) < 1e-9)
      const cd = await withTimeout(ext.getChapterDetails(chapter), 60_000, 'pages')
      const pages = cd?.pages ?? []
      for (let i = 0; i < pages.length; i++) {
        const file = path.join(OUT, `${t.key}-ch${t.ch}--${sourceId}--${String(i).padStart(3, '0')}.img`)
        if (fs.existsSync(file)) continue
        const url = pages[i]
        const buf = url.startsWith('data:')
          ? Buffer.from(url.split(',')[1], 'base64')
          : Buffer.from(await (await fetch(url, { headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
              Referer: REFERER[sourceId] ?? new URL(url).origin + '/',
              Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' } })).arrayBuffer())
        fs.writeFileSync(file, buf)
      }
      console.error(`OK ${t.key}-ch${t.ch} × ${sourceId}: ${pages.length} pages`)
    } catch (err) {
      console.error(`FAIL ${t.key} × ${sourceId}: ${String(err.message).slice(0, 140)}`)
    }
  }
}
