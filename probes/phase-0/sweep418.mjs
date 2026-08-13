// aizoban#3 — the 418 bet. Run every source in the converted Keiyoushi registry
// through search → details → chapters → pages, record pass/fail + error class.
// Resumable: appends JSONL, skips ids already recorded. Usage:
//   node sweep418.mjs [--registry <base>] [--concurrency 8] [--only Id1,Id2]
import fs from 'node:fs'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const REGISTRY = arg('registry', 'https://nicartjay.github.io/PaperbackExt/0.9/stable')
const CONCURRENCY = Number(arg('concurrency', '8'))
const ONLY = arg('only', '')?.split(',').filter(Boolean) ?? []
const RESULTS = path.join(DIR, 'results', 'sweep418.jsonl')
fs.mkdirSync(path.dirname(RESULTS), { recursive: true })

const versioning = await (await fetch(`${REGISTRY}/versioning.json`)).json()
let sources = versioning.sources
if (ONLY.length) sources = sources.filter(s => ONLY.includes(s.id))
const done = new Set(
  fs.existsSync(RESULTS)
    ? fs.readFileSync(RESULTS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id)
    : [])
const todo = sources.filter(s => !done.has(s.id))
console.error(`registry: ${versioning.repository?.name} — ${sources.length} sources, ${done.size} done, ${todo.length} to run`)

// Each source runs in a child process (runner-child.mjs): a hung/crashed
// extension can't take the sweep down, and a hard kill is always available.
function runOne(source) {
  return new Promise((resolve) => {
    const child = fork(path.join(DIR, 'runner-child.mjs'), [REGISTRY, source.id], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], timeout: 180_000,
    })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', () => {})
    child.on('exit', (code, signal) => {
      let rec
      try { rec = JSON.parse(out.trim().split('\n').pop()) }
      catch {
        rec = { ok: false, stage: 'process', class: signal ? 'TIMEOUT' : 'PROCESS_CRASH', error: `exit ${code} sig ${signal}` }
      }
      resolve({ id: source.id, name: source.name, lang: source.language,
                contentRating: source.contentRating, version: source.version, ...rec })
    })
  })
}

let started = 0, finished = 0, passed = 0
const queue = [...todo]
const results = fs.createWriteStream(RESULTS, { flags: 'a' })
async function worker() {
  while (queue.length) {
    const source = queue.shift()
    started++
    const rec = await runOne(source)
    finished++
    if (rec.ok) passed++
    results.write(JSON.stringify(rec) + '\n')
    console.error(`[${finished}/${todo.length}] ${rec.ok ? 'PASS' : 'FAIL'} ${source.id} ${rec.ok ? `(${rec.chapters} ch, ${rec.pages} pages)` : `— ${rec.class}`} · running pass rate ${(100 * passed / finished).toFixed(1)}%`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.error(`DONE: ${passed}/${finished} passed this run (${done.size} were already recorded)`)
