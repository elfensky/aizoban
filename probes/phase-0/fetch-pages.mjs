// aizoban#2 — fetch pages 1, N/2, N of the SAME chapter from multiple sources.
// Ground truth for the pHash separation experiment.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadExtension, withTimeout } from './host.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(DIR, 'fixtures', 'pages')
fs.mkdirSync(OUT, { recursive: true })

const REG_NICART = 'https://nicartjay.github.io/PaperbackExt/0.9/stable'
const REG_INKDEX = 'https://inkdex.github.io/extensions/0.9/stable'
const REGISTRY = { WeebCentral: REG_INKDEX, MangaDex: REG_INKDEX }
const REFERER = {
  WeebCentral: 'https://weebcentral.com/', MangaFreak: 'https://ww2.mangafreak.me/',
  MangaPill: 'https://mangapill.com/', Mangatown: 'https://www.mangatown.com/',
  AsuraScans: 'https://asuracomic.net/', MadaraDex: 'https://madaradex.org/',
  KunMangaOnline: 'https://kunmanga.com/', MangaDex: 'https://mangadex.org/',
}

// (work title, chapter number, sources) — non-webtoon mostly, one webtoon on purpose
const TARGETS = [
  { key: 'one-piece', title: 'One Piece', ch: 1000, sources: ['WeebCentral', 'MangaFreak', 'MangaPill'] },
  { key: 'berserk', title: 'Berserk', ch: 364, sources: ['WeebCentral', 'MangaFreak', 'Mangatown'] },
  { key: 'jujutsu-kaisen', title: 'Jujutsu Kaisen', ch: 236, sources: ['WeebCentral', 'MangaFreak', 'MangaPill'] },
  { key: 'solo-leveling', title: 'Solo Leveling', ch: 110, sources: ['AsuraScans', 'WeebCentral', 'MangaFreak'] },
  { key: 'tales-of-demons', title: 'Tales of Demons and Gods', ch: 300.5, sources: ['WeebCentral', 'MangaPill', 'Mangatown'] },
  { key: 'kingdom', title: 'Kingdom', ch: 700, sources: ['WeebCentral', 'MangaFreak', 'MangaPill'] },
]

const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
const extCache = {}
async function getExt(sourceId) {
  if (extCache[sourceId]) return extCache[sourceId]
  const reg = REGISTRY[sourceId] ?? REG_NICART
  const code = await (await fetch(`${reg}/${sourceId}/index.js`)).text()
  return (extCache[sourceId] = await loadExtension(code, sourceId))
}

const meta = []
for (const t of TARGETS) {
  for (const sourceId of t.sources) {
    try {
      const ext = await getExt(sourceId)
      const paged = await withTimeout(ext.getSearchResults({ title: t.title, filters: [] }, undefined, undefined), 45_000, 'search')
      const hit = (paged?.items ?? []).find(i => norm(i.title) === norm(t.title))
        ?? (paged?.items ?? []).find(i => norm(i.title).startsWith(norm(t.title)))
      if (!hit) { console.error(`MISS ${t.key} × ${sourceId}`); continue }
      const details = await withTimeout(ext.getMangaDetails(hit.mangaId), 45_000, 'details')
      const sourceManga = details?.mangaId ? details : { mangaId: hit.mangaId, mangaInfo: details }
      const chapters = await withTimeout(ext.getChapters(sourceManga), 90_000, 'chapters')
      const chapter = chapters.find(c => Math.abs(Number(c.chapNum) - t.ch) < 1e-9)
      if (!chapter) { console.error(`NOCH ${t.key} ch${t.ch} × ${sourceId}`); continue }
      const cd = await withTimeout(ext.getChapterDetails(chapter), 60_000, 'pages')
      const pages = cd?.pages ?? []
      if (!pages.length) { console.error(`NOPAGES ${t.key} × ${sourceId}`); continue }
      const picks = [['p1', 0], ['pmid', Math.floor(pages.length / 2)], ['plast', pages.length - 1]]
      for (const [tag, idx] of picks) {
        const url = pages[idx]
        const file = path.join(OUT, `${t.key}-ch${t.ch}--${sourceId}--${tag}.img`)
        if (fs.existsSync(file)) continue
        let buf
        if (url.startsWith('data:')) {
          buf = Buffer.from(url.split(',')[1], 'base64')
        } else {
          const res = await fetch(url, { headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            Referer: REFERER[sourceId] ?? new URL(url).origin + '/',
            Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
          } })
          if (!res.ok) { console.error(`IMG ${res.status} ${t.key} × ${sourceId} ${tag}`); continue }
          buf = Buffer.from(await res.arrayBuffer())
        }
        fs.writeFileSync(file, buf)
        meta.push({ work: t.key, ch: t.ch, source: sourceId, tag, idx, pageCount: pages.length, bytes: buf.length, url: url.slice(0, 120) })
        console.error(`OK ${t.key}-ch${t.ch} × ${sourceId} ${tag} (${idx + 1}/${pages.length}) ${buf.length}b`)
      }
    } catch (err) {
      console.error(`FAIL ${t.key} × ${sourceId}: ${String(err.message).slice(0, 140)}`)
    }
  }
}
fs.writeFileSync(path.join(OUT, '_meta.json'), JSON.stringify(meta, null, 1))
console.error(`done: ${meta.length} images`)
