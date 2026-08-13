// Minimal Paperback 0.9 host for Phase 0 probes (aizoban#1/#2/#3).
// node:vm is fine here — these are measurement scripts, not the product.
// Requires the interceptor-chain patch (patches/) applied to node_modules.
import vm from 'node:vm'
import { ApplicationPolyfill } from '@paperback/runtime-polyfills'

const STAGE_TIMEOUT_MS = 45_000

export function withTimeout(promise, ms = STAGE_TIMEOUT_MS, label = 'stage') {
  let t
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`TIMEOUT: ${label} exceeded ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}

export async function loadExtension(bundleCode, sourceId) {
  const app = ApplicationPolyfill()
  const ctx = vm.createContext({
    console,
    URL, URLSearchParams, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval,
    FormData, Blob, Headers, AbortController,
    btoa, atob, crypto, structuredClone, queueMicrotask,
    Buffer,
    // formDidChange: called by Form.reloadForm() but neither declared nor
    // implemented in the polyfill — sources with settings forms crash without it.
    Application: { ...app, formDidChange() {} },
  })
  vm.runInContext(bundleCode, ctx, { timeout: 30_000 })
  const source = vm.runInContext('typeof source === "undefined" ? undefined : source', ctx)
  if (!source) throw new Error('EVAL: no `source` global after eval')
  const ext = source[sourceId] ?? Object.values(source)[0]
  if (!ext) throw new Error(`EVAL: export ${sourceId} missing (has: ${Object.keys(source)})`)
  if (typeof ext.initialise === 'function') await withTimeout(ext.initialise(), 20_000, 'initialise')
  return ext
}

// Run one source through search → details → chapters → pages.
// Returns { stage, ok, error?, class?, counts } — stage = furthest stage reached.
export async function runChain(ext, { queries = ['a', 'love'], mangaId = null } = {}) {
  const out = { searchHits: 0, chapters: 0, pages: 0, mangaId: null, mangaTitle: null }
  let stage = 'search'
  try {
    let manga = null
    if (mangaId) {
      manga = { mangaId }
    } else {
      let results = null
      for (const title of queries) {
        const paged = await withTimeout(
          ext.getSearchResults({ title, filters: [] }, undefined, undefined),
          STAGE_TIMEOUT_MS, 'search')
        const items = paged?.items ?? []
        if (items.length > 0) { results = items; break }
      }
      if (!results) return { stage, ok: false, class: 'EMPTY_SEARCH', ...out }
      out.searchHits = results.length
      manga = results[0]
    }

    stage = 'details'
    const details = await withTimeout(ext.getMangaDetails(manga.mangaId), STAGE_TIMEOUT_MS, 'details')
    const sourceManga = details?.mangaId ? details : { mangaId: manga.mangaId, mangaInfo: details }
    out.mangaId = manga.mangaId
    out.mangaTitle = sourceManga?.mangaInfo?.primaryTitle ?? sourceManga?.mangaInfo?.titles?.[0] ?? null

    stage = 'chapters'
    const chapters = await withTimeout(ext.getChapters(sourceManga), STAGE_TIMEOUT_MS, 'chapters')
    if (!chapters?.length) return { stage, ok: false, class: 'EMPTY_CHAPTERS', ...out }
    out.chapters = chapters.length

    stage = 'pages'
    // newest chapter is chapters[0] by convention; take the last (usually ch.1) —
    // more likely stable/complete on the site
    const chapter = chapters[chapters.length - 1]
    const chapterDetails = await withTimeout(ext.getChapterDetails(chapter), STAGE_TIMEOUT_MS, 'pages')
    const pages = chapterDetails?.pages ?? []
    if (chapterDetails?.type === 'images' && pages.length === 0)
      return { stage, ok: false, class: 'EMPTY_PAGES', ...out }
    out.pages = pages.length
    return { stage, ok: true, ...out }
  } catch (err) {
    return { stage, ok: false, class: classifyError(err, stage),
             error: String(err?.message ?? err).slice(0, 300), ...out }
  }
}

export function classifyError(err, stage) {
  const msg = String(err?.message ?? err)
  if (/Not Implemented/i.test(msg)) return 'NOT_IMPLEMENTED_WEBVIEW'
  if (/cloudflare|cf_clearance|challenge/i.test(msg)) return 'CLOUDFLARE_CHALLENGE'
  if (/^TIMEOUT/.test(msg)) return 'TIMEOUT'
  if (/EVAL:/.test(msg)) return 'EVAL_ERROR'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|certificate|ETIMEDOUT|EAI_AGAIN|socket/i.test(msg)) return 'NETWORK'
  if (/JSON|Unexpected token|Cheerio|parse|Cannot read|undefined is not|null is not/i.test(msg)) return 'PARSER_CHANGED'
  return `EXTENSION_CRASH@${stage}`
}
