import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const roots = ['app', 'lib', 'scripts', 'prisma']
const ignoredDirs = new Set(['node_modules', '.next', '.git'])

const allowedFiles = new Map([
  ['lib/collections.ts', 'Defines and resolves the canonical fallback slug for legacy routes.'],
  ['prisma/bootstrap.ts', 'Creates or repairs the initial default collection during deployment.'],
  ['prisma/seed.ts', 'Seeds a disposable local database with the canonical default collection.'],
])

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) files.push(...walk(full))
    if (stat.isFile() && /\.(ts|tsx|mjs)$/.test(entry)) files.push(full)
  }
  return files
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length
}

const findings = []
const patterns = [
  { label: 'literal axildb slug', regex: /['"`]axildb['"`]/g },
  { label: 'default collection constant', regex: /\bDEFAULT_COLLECTION_SLUG\b/g },
]

for (const root of roots) {
  for (const filePath of walk(root)) {
    const file = filePath.split(path.sep).join('/')
    const source = readFileSync(filePath, 'utf8')
    if (allowedFiles.has(file)) continue

    for (const pattern of patterns) {
      for (let match = pattern.regex.exec(source); match; match = pattern.regex.exec(source)) {
        findings.push({
          file,
          line: lineNumber(source, match.index),
          label: pattern.label,
        })
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Collection default-slug check failed. Avoid assuming the default collection slug in app code:')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.label}`)
  }
  console.error('\nUse the current collection context or ensureDefaultCollection() instead.')
  process.exit(1)
}

console.info('Collection default-slug check passed.')
