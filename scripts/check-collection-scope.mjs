import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const roots = ['app', 'lib', 'scripts']
const ignoredDirs = new Set(['node_modules', '.next', '.git'])
const collectionModels = [
  'governingBody',
  'plantDefinition',
  'plantAlias',
  'locationType',
  'location',
  'plantLocationMove',
  'plantInstance',
  'propagationEvent',
  'bloomEvent',
  'note',
  'photo',
  'plantIdentificationLog',
  'reminder',
  'reminderDelivery',
  'follow',
  'followNotification',
  'auditLog',
]
const readOps = ['findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow', 'count']

const reviewedAllowlist = [
  {
    file: 'scripts/send-reminders.ts',
    model: 'reminder',
    op: 'findMany',
    reason: 'Reminder worker intentionally scans due reminders across collections, then verifies collection membership before sending.',
  },
  {
    file: 'app/actions.ts',
    model: 'photo',
    op: 'count',
    reason: 'Shared-upload cleanup counts duplicate file paths globally before deleting the physical file.',
  },
  {
    file: 'app/server/page.tsx',
    model: 'photo',
    op: 'count',
    reason: 'Server management dashboard intentionally shows global photo count for server admins.',
  },
  {
    file: 'app/uploads/[filename]/route.ts',
    model: 'photo',
    op: 'findFirst',
    reason: 'Upload route intentionally checks a file path globally before serving bytes so censored or removed uploads cannot be fetched directly.',
  },
  {
    file: 'lib/image-moderation.ts',
    model: 'photo',
    op: 'findMany',
    reason: 'Image moderation worker intentionally scans pending uploaded photos across collections, then updates only the selected photo and review rows.',
  },
  {
    file: 'lib/admin/orphanedImages.ts',
    model: 'photo',
    op: 'findMany',
    reason: 'Server-admin orphaned image cleanup intentionally gathers sitewide upload references before comparing them with files in upload storage.',
  },
  {
    file: 'lib/admin/orphanedImages.ts',
    model: 'plantIdentificationLog',
    op: 'findMany',
    reason: 'Server-admin orphaned image cleanup intentionally gathers sitewide ID My Plant upload references before comparing them with files in upload storage.',
  },
  {
    file: 'app/account/page.tsx',
    model: 'plantIdentificationLog',
    op: 'findMany',
    reason: 'Account page intentionally lists only the current user’s own ID My Plant history across collections.',
  },
]

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

function balancedCall(source, start) {
  const firstParen = source.indexOf('(', start)
  if (firstParen === -1) return ''

  let depth = 0
  let quote = null
  let escaped = false

  for (let i = firstParen; i < source.length; i += 1) {
    const char = source[i]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }

  return source.slice(start)
}

function isAllowed(file, model, op) {
  return reviewedAllowlist.some((item) => item.file === file && item.model === model && item.op === op)
}

const findings = []

for (const root of roots) {
  for (const filePath of walk(root)) {
    const file = filePath.split(path.sep).join('/')
    const source = readFileSync(filePath, 'utf8')

    for (const model of collectionModels) {
      for (const op of readOps) {
        const pattern = new RegExp(`prisma\\.${model}\\.${op}\\s*\\(`, 'g')
        for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
          const snippet = balancedCall(source, match.index)
          if (snippet.includes('collectionId') || snippet.includes('collectionWhere')) continue
          if (isAllowed(file, model, op)) continue

          findings.push({
            file,
            line: lineNumber(source, match.index),
            model,
            op,
            preview: snippet.replace(/\s+/g, ' ').slice(0, 180),
          })
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Collection scope check failed. Review these collection-owned read queries:')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} prisma.${finding.model}.${finding.op}`)
    console.error(`  ${finding.preview}`)
  }
  console.error('\nIf a cross-collection read is intentional, add a narrow reviewed allowlist entry in scripts/check-collection-scope.mjs.')
  process.exit(1)
}

console.info('Collection scope check passed.')
