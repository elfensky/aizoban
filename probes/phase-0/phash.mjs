// aizoban#2 — pHash (32x32 DCT → 8x8) + dHash (9x8 gradient), Hamming distances.
// Same-page-different-source vs different-page distributions → is there a threshold?
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const PAGES = path.join(DIR, 'fixtures', 'pages')

function dct2d(px, N) { // naive DCT-II, N=32 — fine for a probe
  const out = new Float64Array(N * N), c = k => (k === 0 ? Math.SQRT1_2 : 1)
  for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) {
    let s = 0
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++)
      s += px[x * N + y] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N))
    out[u * N + v] = (2 / N) * c(u) * c(v) * s
  }
  return out
}

async function hashes(file) {
  const { data } = await sharp(file).grayscale().resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const coef = dct2d(data, 32)
  const block = []
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) block.push(coef[u * 32 + v])
  const ac = block.slice(1)
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)]
  const phash = ac.map(x => (x > median ? 1 : 0))
  const { data: d2 } = await sharp(file).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const dhash = []
  for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) dhash.push(d2[r * 9 + col] < d2[r * 9 + col + 1] ? 1 : 0)
  return { phash, dhash }
}
const ham = (a, b) => a.reduce((s, x, i) => s + (x ^ b[i]), 0)

const files = fs.readdirSync(PAGES).filter(f => f.endsWith('.img'))
const items = []
for (const f of files) {
  const m = f.match(/^(.+)-ch([\d.]+)--(.+?)--(p1|pmid|plast)\.img$/)
  const buf = fs.readFileSync(path.join(PAGES, f))
  items.push({ file: f, work: m[1], ch: m[2], source: m[3], tag: m[4],
    sha: buf.length + ':' + buf.subarray(0, 64).toString('hex'), ...(await hashes(path.join(PAGES, f))) })
}

const same = [], diff = []
for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
  const A = items[i], B = items[j]
  const d = { p: ham(A.phash, B.phash), d: ham(A.dhash, B.dhash),
    identical: A.sha === B.sha, label: `${A.work}-ch${A.ch} ${A.tag} ${A.source}×${B.source}` }
  if (A.work === B.work && A.ch === B.ch && A.tag === B.tag) same.push(d)
  else diff.push(d)
}

const stats = (xs) => {
  const v = xs.map(x => x.p).sort((a, b) => a - b)
  return { n: v.length, min: v[0], p25: v[Math.floor(v.length * .25)], med: v[Math.floor(v.length * .5)], p75: v[Math.floor(v.length * .75)], max: v.at(-1) }
}
console.log('SAME page, different source :', JSON.stringify(stats(same)))
console.log('DIFFERENT page              :', JSON.stringify(stats(diff)))
console.log('\nbyte-identical same-pairs:', same.filter(x => x.identical).length, 'of', same.length)
console.log('\nsame-page pairs by distance:')
for (const s of same.sort((a, b) => a.p - b.p)) console.log(`  ${String(s.p).padStart(3)} (dhash ${String(s.d).padStart(3)}) ${s.identical ? '[identical bytes] ' : ''}${s.label}`)
console.log('\nclosest DIFFERENT-page pairs:')
for (const s of diff.sort((a, b) => a.p - b.p).slice(0, 12)) console.log(`  ${String(s.p).padStart(3)} (dhash ${String(s.d).padStart(3)}) ${s.label}`)

// threshold scan
console.log('\nthreshold scan (pHash):')
for (let t = 4; t <= 28; t += 2) {
  const fn = same.filter(x => x.p > t).length, fp = diff.filter(x => x.p <= t).length
  console.log(`  t=${String(t).padStart(2)}: false-neg ${fn}/${same.length} · false-pos ${fp}/${diff.length}`)
}
