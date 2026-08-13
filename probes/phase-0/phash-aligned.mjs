// aizoban#2 — alignment-aware separation. Same-content pairs = mutual nearest
// neighbours between two sources' page sequences; different = all other cross pairs.
// Also: template-page detection (hashes recurring across works = ads/credits).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const PAGES = path.join(DIR, 'fixtures', 'pages-full')

function dct2d(px, N) {
  const out = new Float64Array(N * N), c = k => (k === 0 ? Math.SQRT1_2 : 1)
  for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) {
    let s = 0
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++)
      s += px[x * N + y] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N))
    out[u * N + v] = (2 / N) * c(u) * c(v) * s
  }
  return out
}
async function phash(file) {
  const { data } = await sharp(file).grayscale().resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const coef = dct2d(data, 32)
  const block = []
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) block.push(coef[u * 32 + v])
  const ac = block.slice(1)
  const med = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)]
  return ac.map(x => (x > med ? 1 : 0))
}
const ham = (a, b) => a.reduce((s, x, i) => s + (x ^ b[i]), 0)

// load all pages grouped by (work, source)
const seqs = {}
for (const f of fs.readdirSync(PAGES).filter(f => f.endsWith('.img'))) {
  const m = f.match(/^(.+)-ch([\d.]+)--(.+?)--(\d+)\.img$/)
  const key = `${m[1]}|${m[3]}`
  ;(seqs[key] ??= []).push({ idx: Number(m[4]), file: f, hash: await phash(path.join(PAGES, f)) })
}
for (const k of Object.keys(seqs)) seqs[k].sort((a, b) => a.idx - b.idx)

// template pages: same hash (dist<=6) appearing in DIFFERENT works within one source
const bySource = {}
for (const [key, pages] of Object.entries(seqs)) {
  const [work, source] = key.split('|')
  ;(bySource[source] ??= []).push(...pages.map(p => ({ ...p, work })))
}
const templates = new Set()
for (const [source, pages] of Object.entries(bySource)) {
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++)
    if (pages[i].work !== pages[j].work && ham(pages[i].hash, pages[j].hash) <= 6) {
      templates.add(pages[i].file); templates.add(pages[j].file)
      console.log(`TEMPLATE ${source}: ${pages[i].file} ≈ ${pages[j].file} (d=${ham(pages[i].hash, pages[j].hash)})`)
    }
}

// per work: mutual-NN alignment between source pairs, excluding template pages
const same = [], diff = []
const works = [...new Set(Object.keys(seqs).map(k => k.split('|')[0]))]
for (const work of works) {
  const sources = Object.keys(seqs).filter(k => k.startsWith(work + '|'))
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const A = seqs[sources[i]].filter(p => !templates.has(p.file))
    const B = seqs[sources[j]].filter(p => !templates.has(p.file))
    const d = A.map(a => B.map(b => ham(a.hash, b.hash)))
    for (let x = 0; x < A.length; x++) for (let y = 0; y < B.length; y++) {
      const bestForA = Math.min(...d[x]), bestForB = Math.min(...d.map(r => r[y]))
      const mutual = d[x][y] === bestForA && d[x][y] === bestForB
      ;(mutual ? same : diff).push({ v: d[x][y], label: `${work} ${sources[i].split('|')[1]}#${A[x].idx}×${sources[j].split('|')[1]}#${B[y].idx}` })
    }
  }
}

const stats = xs => {
  const v = xs.map(x => x.v).sort((a, b) => a - b)
  return { n: v.length, min: v[0], p05: v[Math.floor(v.length * .05)], p25: v[Math.floor(v.length * .25)], med: v[Math.floor(v.length * .5)], p95: v[Math.floor(v.length * .95)], max: v.at(-1) }
}
console.log('\nALIGNED same-content   :', JSON.stringify(stats(same)))
console.log('cross different-content:', JSON.stringify(stats(diff)))
console.log('\nworst aligned pairs:')
for (const s of same.sort((a, b) => b.v - a.v).slice(0, 10)) console.log(`  ${s.v} ${s.label}`)
console.log('\nthreshold scan:')
for (let t = 6; t <= 26; t += 2) {
  const fn = same.filter(x => x.v > t).length, fp = diff.filter(x => x.v <= t).length
  console.log(`  t=${String(t).padStart(2)}: miss ${fn}/${same.length} aligned · wrongly-accept ${fp}/${diff.length} different`)
}
