// aizoban#1 — ordinal drift analysis over the chapter fixtures.
// Naive number match, pairwise per work, drift decomposed into the four flavours.
// Output: results/drift-report.json + markdown summary on stdout.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(DIR, 'fixtures', 'chapters')

// Load fixtures grouped by work. Collapse each source to unique chapNums
// (multi-group/multi-version listings are recorded separately, not drift).
const byWork = {}
for (const file of fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'))
  const nums = new Map() // chapNum -> count of versions
  let unparseable = 0
  for (const c of d.chapters) {
    const n = Number(c.chapNum)
    if (!Number.isFinite(n)) { unparseable++; continue }
    nums.set(n, (nums.get(n) ?? 0) + 1)
  }
  ;(byWork[d.work] ??= []).push({
    source: d.source, title: d.matchedTitle.trim(),
    raw: d.chapters.length, unparseable,
    nums: [...nums.keys()].sort((a, b) => a - b),
    versions: [...nums.values()].filter(v => v > 1).length,
  })
}

const isFrac = (n) => Math.abs(n - Math.round(n)) > 1e-9

// Classify each unmatched chapter number in the overlap window of a pair.
function analyzePair(A, B) {
  const lo = Math.max(A.nums[0], B.nums[0])
  const hi = Math.min(A.nums.at(-1), B.nums.at(-1))
  const a = A.nums.filter(n => n >= lo && n <= hi)
  const b = B.nums.filter(n => n >= lo && n <= hi)
  if (a.length < 10 || b.length < 10) return null // overlap too small to say anything
  const setA = new Set(a), setB = new Set(b)
  const union = new Set([...a, ...b])
  const misses = [...union].filter(n => !(setA.has(n) && setB.has(n)))

  const flavours = { split: 0, interstitial: 0, offset: 0, other: 0 }
  for (const n of misses) {
    const inA = setA.has(n)
    const [has, lacks] = inA ? [setA, setB] : [setB, setA]
    if (isFrac(n)) {
      const base = Math.floor(n)
      // split: x.1/x.2 style where the OTHER side has whole x — or vice versa
      const fracSiblings = [...has].filter(m => Math.floor(m) === base && isFrac(m))
      if (fracSiblings.length >= 2 && lacks.has(base)) flavours.split++
      else flavours.interstitial++ // lone x.5 extra one side carries
    } else {
      // whole number one side lacks: offset candidate if neighbours also missing
      // (contiguous runs of misses on the same side = offset/renumber region)
      flavours.offset++ // provisional; refined below via shift detection
    }
  }

  // Shift detection: does aligning B+k (k=±1..3, ±0.5) fix a chunk of the misses?
  let bestShift = 0, bestFixed = 0
  for (const k of [-3, -2, -1, -0.5, 0.5, 1, 2, 3]) {
    const shifted = new Set([...setB].map(n => n + k))
    const fixed = [...setA].filter(n => !setB.has(n) && shifted.has(n)).length
    if (fixed > bestFixed) { bestFixed = fixed; bestShift = k }
  }
  const offsetConfirmed = bestFixed >= 5 // ≥5 chapters healed by one constant shift

  return {
    pair: `${A.source} ↔ ${B.source}`, window: [lo, hi],
    inWindow: union.size, misses: misses.length,
    driftRate: misses.length / union.size,
    flavours, offsetShift: offsetConfirmed ? bestShift : null, offsetHealed: offsetConfirmed ? bestFixed : 0,
    missSample: misses.slice(0, 12),
  }
}

const report = {}
let totUnion = 0, totMiss = 0
const flavourTotals = { split: 0, interstitial: 0, offset: 0, other: 0 }
for (const [work, sources] of Object.entries(byWork)) {
  const pairs = []
  for (let i = 0; i < sources.length; i++)
    for (let j = i + 1; j < sources.length; j++) {
      const p = analyzePair(sources[i], sources[j])
      if (p) pairs.push(p)
    }
  report[work] = {
    sources: sources.map(s => ({ source: s.source, chapters: s.nums.length, raw: s.raw,
      versions: s.versions, unparseable: s.unparseable,
      fracShare: s.nums.filter(isFrac).length / (s.nums.length || 1) })),
    pairs,
  }
  for (const p of pairs) {
    totUnion += p.inWindow; totMiss += p.misses
    for (const k of Object.keys(flavourTotals)) flavourTotals[k] += p.flavours[k] ?? 0
  }
}

fs.mkdirSync(path.join(DIR, 'results'), { recursive: true })
fs.writeFileSync(path.join(DIR, 'results', 'drift-report.json'), JSON.stringify(report, null, 1))

// ---- summary ----
console.log(`# Ordinal drift — ${Object.keys(byWork).length} works, pairwise naive number match\n`)
console.log(`OVERALL: ${totMiss} of ${totUnion} pair-chapters unmatched → **${(100 * totMiss / totUnion).toFixed(1)}% drift**`)
console.log(`flavours (of unmatched): ${JSON.stringify(flavourTotals)}\n`)
for (const [work, r] of Object.entries(report)) {
  const rates = r.pairs.map(p => p.driftRate)
  const avg = rates.length ? (100 * rates.reduce((x, y) => x + y, 0) / rates.length) : 0
  console.log(`## ${work} — avg pair drift ${avg.toFixed(1)}% (${r.pairs.length} pairs)`)
  for (const s of r.sources)
    console.log(`  - ${s.source}: ${s.chapters} uniq (${s.raw} raw, ${s.versions} multi-version, ${(100 * s.fracShare).toFixed(1)}% fractional)`)
  for (const p of r.pairs.sort((x, y) => y.driftRate - x.driftRate).slice(0, 3))
    console.log(`  ✗ ${p.pair}: ${(100 * p.driftRate).toFixed(1)}% of ${p.inWindow}${p.offsetShift ? ` — OFFSET ${p.offsetShift > 0 ? '+' : ''}${p.offsetShift} heals ${p.offsetHealed}` : ''} — miss: ${p.missSample.slice(0, 8).join(',')}`)
  console.log()
}
