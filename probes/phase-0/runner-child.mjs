// Child process for sweep418.mjs — fetch one source's bundle, run the chain,
// print one JSON line to stdout. Isolated so a pathological bundle can be killed.
import { loadExtension, runChain, classifyError } from './host.mjs'

const [registry, sourceId, queriesArg] = process.argv.slice(2)
const t0 = Date.now()
let stage = 'bundle'
try {
  const res = await fetch(`${registry}/${sourceId}/index.js`)
  if (!res.ok) throw new Error(`EVAL: bundle HTTP ${res.status}`)
  const code = await res.text()
  stage = 'eval'
  const ext = await loadExtension(code, sourceId)
  stage = 'search'
  const result = await runChain(ext, queriesArg ? { queries: queriesArg.split(",") } : {})
  console.log(JSON.stringify({ ...result, ms: Date.now() - t0 }))
} catch (err) {
  console.log(JSON.stringify({
    ok: false, stage, class: classifyError(err, stage),
    error: String(err?.message ?? err).slice(0, 300), ms: Date.now() - t0,
  }))
}
process.exit(0)
