import { PrismaClient } from '@prisma/client'
import { auditCareScheduleBatch } from '../lib/care-schedule-integrity'
import { normalizeTimeZone } from '../lib/time'
const args = process.argv.slice(2)
const value = (key: string) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1] }
async function main() {
  const slug = value('--collection'), zone = value('--timezone')
  if (!slug || !zone) throw new Error('Usage: npm run care:audit -- --collection SLUG --timezone America/New_York [--apply] [--after ID] [--batch-size 100]')
  const timezone = normalizeTimeZone(zone)
  if (timezone !== zone) throw new Error('Supply a valid explicit IANA time zone.')
  const db = new PrismaClient()
  try {
    const collection = await db.collection.findUniqueOrThrow({ where: { slug } })
    let after = value('--after'), instances = 0, obligations = 0, applied = 0
    const breakdown: Record<string, number> = {}
    do {
      const batch = await auditCareScheduleBatch(db, { collectionId: collection.id, collectionSlug: slug, timezone, after, batchSize: Number(value('--batch-size') || 100), apply: args.includes('--apply') })
      instances += batch.activeInstances; obligations += batch.scheduledObligations; applied += batch.applied
      for (const row of batch.discrepancies) { const key = String(row.discrepancy); breakdown[key] = (breakdown[key] || 0) + 1 }
      console.log(JSON.stringify({ kind: 'batch', ...batch }))
      after = batch.nextCursor || undefined
    } while (after)
    console.log(JSON.stringify({ kind: 'summary', finishedAt: new Date(), mode: args.includes('--apply') ? 'apply' : 'dry-run', instances, obligations, applied, breakdown }))
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
