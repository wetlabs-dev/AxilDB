// Controlled test only: node --expose-gc scripts/profile-preview-memory.cjs [git-ref]
const fs = require('node:fs'),
  vm = require('node:vm'),
  ts = require('typescript')
const { execFileSync } = require('node:child_process')
if (!global.gc)
  throw new Error(
    'Use --expose-gc for repeatable test measurements; never enable this in production.'
  )
const source = process.argv[2]
  ? execFileSync(
      'git',
      ['show', `${process.argv[2]}:components/PlantIdPreviewLink.tsx`],
      { encoding: 'utf8' }
    )
  : fs.readFileSync('components/PlantIdPreviewLink.tsx', 'utf8')
const block = source.slice(
  source.indexOf('const previewCache'),
  source.indexOf('function formatRelativeDate')
)
const cacheModule = { exports: {} }
vm.runInNewContext(
  ts.transpile(fs.readFileSync('lib/bounded-cache.ts', 'utf8'), {
    module: ts.ModuleKind.CommonJS,
  }),
  { exports: cacheModule.exports, Date, Map }
)
const context = vm.createContext({
  BoundedCache: cacheModule.exports.BoundedCache,
  AbortSignal,
  // Timer-free fake deadline: this profiles cache retention, not undici's timeout implementation.
  fetch: async () => ({
    ok: true,
    status: 200,
    json: async () => ({ displayName: 'Plant', notes: 'x'.repeat(2000) }),
  }),
})
context.AbortSignal = { timeout: () => undefined }
vm.runInContext(
  ts.transpile(
    block +
      '\nglobalThis.load=fetchPreview;globalThis.size=()=>previewCache.size'
  ),
  context
)
;(async () => {
  const rows = []
  for (let cycle = 0; cycle < 5; cycle++) {
    for (let i = 0; i < 2000; i++)
      await context.load('collection', String(cycle * 2000 + i))
    global.gc()
    rows.push({
      cycle: cycle + 1,
      entries: context.size(),
      ...process.memoryUsage(),
      uptime: process.uptime(),
      resources: process.getActiveResourcesInfo(),
    })
  }
  console.log(JSON.stringify(rows, null, 2))
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
