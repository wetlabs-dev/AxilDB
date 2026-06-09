import type { Prisma, PrismaClient } from '@prisma/client'
import { appUrl, sendEmail } from '@/lib/email'
import { renderBrandedEmail } from '@/lib/email-templates'
import { husbandryFieldNames } from '@/lib/husbandry'
import { sendPushNotification } from '@/lib/push'
import { addCalendarDays, formatDateTime, startOfDayInTimeZone, timeZoneForPreference } from '@/lib/time'
import { plantName } from '@/lib/utils'

type DefinitionSnapshot = {
  definition: any
  aliases: string
  husbandry: Record<string, string>
  typeImage: string
}

type ChangeRow = {
  field: string
  previous: string
  updated: string
}

type DigestChange = {
  id: string
  changedAt: Date
  definitionId: string
  definitionName: string
  rows: ChangeRow[]
  definitionUrl: string
  affectedCount: number
}

const definitionFields = [
  ['genus', 'Genus'],
  ['species', 'Species'],
  ['hybridNotation', 'Hybrid notation'],
  ['cultivarName', 'Cultivar name'],
  ['authority', 'Authority'],
  ['cultivarRegistrationNumber', 'Registration number'],
  ['confidence', 'Confidence'],
  ['acquisitionLabel', 'Acquisition label'],
  ['provisionalTaxon', 'Provisional taxon'],
  ['wikipediaUrl', 'Wikipedia URL'],
  ['inaturalistUrl', 'iNaturalist URL'],
  ['powoUrl', 'POWO URL'],
  ['gbifUrl', 'GBIF URL'],
  ['description', 'Description'],
  ['notes', 'Notes'],
  ['validationNotes', 'Validation notes'],
] as const

function text(value: unknown) {
  return String(value ?? '').trim()
}

function truncate(value: string, max = 140) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return '—'
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function aliasSummary(aliases: Array<{ name: string; aliasType?: string | null }>) {
  if (!aliases.length) return ''
  return aliases
    .map((alias) => `${alias.name}${alias.aliasType ? ` (${alias.aliasType.toLowerCase()})` : ''}`)
    .sort((a, b) => a.localeCompare(b))
    .join('; ')
}

function typeImageSummary(photos: Array<{ path: string; caption?: string | null; isType: boolean }>) {
  const typeImage = photos.find((photo) => photo.isType) || photos[0]
  return typeImage ? [typeImage.caption, typeImage.path].filter(Boolean).join(' · ') : ''
}

export function validatedDefinitionInclude() {
  return {
    aliases: { orderBy: { name: 'asc' } },
    husbandryGuide: true,
  } satisfies Prisma.PlantDefinitionInclude
}

export function snapshotValidatedDefinition(definition: any): DefinitionSnapshot {
  return {
    definition,
    aliases: aliasSummary(definition.aliases || []),
    husbandry: Object.fromEntries(husbandryFieldNames.map((field) => [field, text(definition.husbandryGuide?.[field])])),
    typeImage: typeImageSummary(definition.photos || []),
  }
}

function diffSnapshots(previous: DefinitionSnapshot, next: DefinitionSnapshot): ChangeRow[] {
  const rows: ChangeRow[] = []
  for (const [field, label] of definitionFields) {
    const before = text(previous.definition[field])
    const after = text(next.definition[field])
    if (before !== after) rows.push({ field: label, previous: truncate(before), updated: truncate(after) })
  }

  if (previous.aliases !== next.aliases) {
    rows.push({ field: 'Aliases', previous: truncate(previous.aliases), updated: truncate(next.aliases) })
  }

  for (const field of husbandryFieldNames) {
    const before = previous.husbandry[field] || ''
    const after = next.husbandry[field] || ''
    if (before !== after) rows.push({ field: `Husbandry: ${field}`, previous: truncate(before), updated: truncate(after) })
  }

  if (previous.typeImage !== next.typeImage) {
    rows.push({
      field: 'Type image',
      previous: previous.typeImage ? 'Type image changed or removed' : '—',
      updated: next.typeImage ? 'Type image added or changed' : 'Type image removed',
    })
  }

  return rows
}

export async function recordValidatedDefinitionChange(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    validatedDefinitionId: string
    changedByUserId?: string | null
    previous: DefinitionSnapshot
    next: DefinitionSnapshot
  },
) {
  const rows = diffSnapshots(input.previous, input.next)
  if (!rows.length) return null
  return prisma.validatedDefinitionChange.create({
    data: {
      validatedDefinitionId: input.validatedDefinitionId,
      changedByUserId: input.changedByUserId,
      changeSummary: rows.map((row) => row.field).slice(0, 6).join(', '),
      changedFieldsJson: rows.map((row) => row.field),
      previousValuesJson: Object.fromEntries(rows.map((row) => [row.field, row.previous])),
      nextValuesJson: Object.fromEntries(rows.map((row) => [row.field, row.updated])),
    },
  })
}

export function changeRowsFromJson(change: { previousValuesJson: unknown; nextValuesJson: unknown }) {
  const previous = (change.previousValuesJson && typeof change.previousValuesJson === 'object' && !Array.isArray(change.previousValuesJson))
    ? change.previousValuesJson as Record<string, unknown>
    : {}
  const next = (change.nextValuesJson && typeof change.nextValuesJson === 'object' && !Array.isArray(change.nextValuesJson))
    ? change.nextValuesJson as Record<string, unknown>
    : {}
  return Object.keys({ ...previous, ...next }).map((field) => ({
    field,
    previous: truncate(text(previous[field])),
    updated: truncate(text(next[field])),
  }))
}

function localDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function previousLocalDayWindow(now: Date, timezone: string) {
  const todayStart = startOfDayInTimeZone(now, timezone)
  const start = addCalendarDays(todayStart, -1, timezone)
  return { start, end: todayStart, localDate: localDateKey(start, timezone) }
}

function digestTableHtml(changes: DigestChange[]) {
  const rows = changes.flatMap((change) =>
    change.rows.map((row) => `
      <tr>
        <td style="border-top:1px solid #eadfcb;padding:10px;vertical-align:top;"><a href="${escapeHtml(change.definitionUrl)}" style="color:#2f6b45;font-weight:700;">${escapeHtml(change.definitionName)}</a><br><span style="color:#756f64;font-size:12px;">${formatDateTime(change.changedAt)}</span></td>
        <td style="border-top:1px solid #eadfcb;padding:10px;vertical-align:top;">${escapeHtml(row.field)}</td>
        <td style="border-top:1px solid #eadfcb;padding:10px;vertical-align:top;color:#756f64;">${escapeHtml(row.previous)}</td>
        <td style="border-top:1px solid #eadfcb;padding:10px;vertical-align:top;">${escapeHtml(row.updated)}</td>
        <td style="border-top:1px solid #eadfcb;padding:10px;vertical-align:top;text-align:right;">${change.affectedCount}</td>
      </tr>
    `),
  ).join('')

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:12px;font-size:14px;line-height:1.4;">
      <thead>
        <tr>
          <th align="left" style="padding:10px;color:#756f64;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Definition</th>
          <th align="left" style="padding:10px;color:#756f64;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Field / Section</th>
          <th align="left" style="padding:10px;color:#756f64;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Previous</th>
          <th align="left" style="padding:10px;color:#756f64;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Updated</th>
          <th align="right" style="padding:10px;color:#756f64;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Plants</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function collectionUpdateDigestEmail(collectionName: string, collectionUrl: string, changes: DigestChange[]) {
  const template = renderBrandedEmail({
    title: 'Collection update digest',
    preview: 'Validated plant definitions changed for your collection.',
    body: [
      `${collectionName} has ${changes.length} validated definition update${changes.length === 1 ? '' : 's'} from yesterday.`,
      'These are reference/library updates, separate from care tasks.',
    ],
    actionLabel: 'Open collection',
    actionUrl: collectionUrl,
  })
  return {
    text: [
      `Collection update digest for ${collectionName}`,
      '',
      ...changes.flatMap((change) => [
        `${change.definitionName} (${change.affectedCount} linked plant${change.affectedCount === 1 ? '' : 's'})`,
        ...change.rows.map((row) => `- ${row.field}: ${row.previous} -> ${row.updated}`),
        change.definitionUrl,
        '',
      ]),
    ].join('\n'),
    html: template.html.replace('</td>\n            </tr>', `${digestTableHtml(changes)}</td>\n            </tr>`),
  }
}

export async function recentCollectionUpdates(prisma: PrismaClient, collectionId: string, collectionSlug: string, take = 10) {
  const instances = await prisma.plantInstance.findMany({
    where: { collectionId, plantDefinition: { is: { collectionId: null, isValidated: true } } },
    select: { plantDefinitionId: true },
  })
  const counts = new Map<string, number>()
  for (const instance of instances) counts.set(instance.plantDefinitionId, (counts.get(instance.plantDefinitionId) || 0) + 1)
  const changes = await prisma.validatedDefinitionChange.findMany({
    where: { validatedDefinitionId: { in: [...counts.keys()] } },
    include: { validatedDefinition: true },
    orderBy: { changedAt: 'desc' },
    take,
  })
  return changes.map((change) => ({
    id: change.id,
    changedAt: change.changedAt,
    definitionId: change.validatedDefinitionId,
    definitionName: plantName(change.validatedDefinition),
    definitionUrl: `/c/${collectionSlug}/validated-definitions#definition-${change.validatedDefinitionId}`,
    affectedCount: counts.get(change.validatedDefinitionId) || 0,
    rows: changeRowsFromJson(change),
  }))
}

export async function sendCollectionUpdateDigestAlerts(prisma: PrismaClient, now = new Date()) {
  const collections = await prisma.collection.findMany({
    where: {
      status: 'ACTIVE',
      memberships: {
        some: {
          status: 'ACTIVE',
          role: { in: ['MANAGER', 'GARDENER'] },
          user: {
            emailPreference: {
              OR: [
                { collectionUpdateDigestEmailEnabled: true },
                { collectionUpdateDigestPushEnabled: true },
              ],
            },
          },
        },
      },
    },
    include: {
      memberships: {
        where: { status: 'ACTIVE', role: { in: ['MANAGER', 'GARDENER'] } },
        include: { user: { include: { emailPreference: true } } },
      },
    },
  })

  let sent = 0
  let failed = 0

  for (const collection of collections) {
    const changes = await recentCollectionUpdates(prisma, collection.id, collection.slug, 50)
    const collectionUrl = appUrl(`/c/${collection.slug}`)
    for (const membership of collection.memberships) {
      const user = membership.user
      const emailEnabled = user.emailPreference?.collectionUpdateDigestEmailEnabled === true
      const pushEnabled = user.emailPreference?.collectionUpdateDigestPushEnabled === true
      const timezone = timeZoneForPreference(user.emailPreference)
      const window = previousLocalDayWindow(now, timezone)
      const windowChanges = changes
        .filter((change) => change.changedAt >= window.start && change.changedAt < window.end)
        .map((change) => ({ ...change, definitionUrl: appUrl(change.definitionUrl) }))
      if (!windowChanges.length) continue

      if (pushEnabled) {
        try {
          await prisma.collectionUpdateDigestDelivery.create({
            data: { collectionId: collection.id, userId: user.id, channel: 'PUSH', localDate: window.localDate, timezone, status: 'PENDING' },
          })
          const result = await sendPushNotification(user.id, {
            title: 'Collection update digest',
            body: 'Validated plant definitions changed.',
            url: `/c/${collection.slug}`,
            tag: `collection-update-digest-${collection.id}-${window.localDate}`,
            preferenceKey: 'collectionUpdateDigestPushEnabled',
          }, prisma)
          await prisma.collectionUpdateDigestDelivery.updateMany({
            where: { collectionId: collection.id, userId: user.id, channel: 'PUSH', localDate: window.localDate },
            data: { status: result.sent > 0 ? 'SENT' : 'SKIPPED', sentAt: result.sent > 0 ? now : null },
          })
          if (result.sent > 0) sent += 1
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('Unique constraint')) {
            failed += 1
            console.error('Failed to send collection update push digest', { collectionId: collection.id, userId: user.id, error })
          }
        }
      }

      if (emailEnabled && user.emailVerifiedAt) {
        try {
          await prisma.collectionUpdateDigestDelivery.create({
            data: { collectionId: collection.id, userId: user.id, channel: 'EMAIL', localDate: window.localDate, timezone, status: 'PENDING' },
          })
          const template = collectionUpdateDigestEmail(collection.name, collectionUrl, windowChanges)
          await sendEmail({
            to: user.email,
            subject: `AxilDB collection update digest: ${collection.name}`,
            ...template,
          })
          await prisma.collectionUpdateDigestDelivery.updateMany({
            where: { collectionId: collection.id, userId: user.id, channel: 'EMAIL', localDate: window.localDate },
            data: { status: 'SENT', sentAt: now },
          })
          sent += 1
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('Unique constraint')) {
            failed += 1
            await prisma.collectionUpdateDigestDelivery.updateMany({
              where: { collectionId: collection.id, userId: user.id, channel: 'EMAIL', localDate: window.localDate },
              data: { status: 'FAILED', error: error instanceof Error ? error.message : String(error) },
            })
            console.error('Failed to send collection update email digest', { collectionId: collection.id, userId: user.id, error })
          }
        }
      }
    }
  }

  return { considered: collections.length, sent, failed }
}
