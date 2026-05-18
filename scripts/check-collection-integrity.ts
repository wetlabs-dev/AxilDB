import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const requiredCollectionModels = [
  ['GoverningBody', 'governingBody'],
  ['PlantDefinition', 'plantDefinition'],
  ['PlantAlias', 'plantAlias'],
  ['PlantInstance', 'plantInstance'],
  ['PropagationEvent', 'propagationEvent'],
  ['BloomEvent', 'bloomEvent'],
  ['Note', 'note'],
  ['Photo', 'photo'],
  ['Reminder', 'reminder'],
  ['ReminderDelivery', 'reminderDelivery'],
  ['Follow', 'follow'],
  ['FollowNotification', 'followNotification'],
] as const

const relationshipChecks = [
  {
    label: 'Exactly one default collection exists',
    sql: `
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 0
        WHEN COUNT(*) FILTER (WHERE "isDefault" = true) = 1 THEN 0
        ELSE 1
      END AS count
      FROM "Collection"
    `,
  },
  {
    label: 'Every collection has at least one active owner',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Collection" collection
      WHERE NOT EXISTS (
        SELECT 1
        FROM "CollectionMembership" membership
        WHERE membership."collectionId" = collection.id
          AND membership.status = 'ACTIVE'
          AND membership.role = 'OWNER'
      )
    `,
  },
  {
    label: 'PlantAlias.collectionId matches PlantDefinition.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantAlias" alias
      JOIN "PlantDefinition" definition ON definition.id = alias."plantDefinitionId"
      WHERE alias."collectionId" IS DISTINCT FROM definition."collectionId"
    `,
  },
  {
    label: 'PlantDefinition.collectionId matches GoverningBody.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantDefinition" definition
      JOIN "GoverningBody" body ON body.id = definition."governingBodyId"
      WHERE definition."collectionId" IS DISTINCT FROM body."collectionId"
    `,
  },
  {
    label: 'PlantInstance.collectionId matches PlantDefinition.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantInstance" instance
      JOIN "PlantDefinition" definition ON definition.id = instance."plantDefinitionId"
      WHERE instance."collectionId" IS DISTINCT FROM definition."collectionId"
    `,
  },
  {
    label: 'BloomEvent.collectionId matches PlantInstance.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "BloomEvent" bloom
      JOIN "PlantInstance" instance ON instance.id = bloom."plantInstanceId"
      WHERE bloom."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'ParentageLink parent collection matches PropagationEvent.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "ParentageLink" link
      JOIN "PropagationEvent" event ON event.id = link."propagationEventId"
      JOIN "PlantInstance" instance ON instance.id = link."parentPlantInstanceId"
      WHERE event."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'PropagationChild child collection matches PropagationEvent.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PropagationChild" child
      JOIN "PropagationEvent" event ON event.id = child."propagationEventId"
      JOIN "PlantInstance" instance ON instance.id = child."childPlantInstanceId"
      WHERE event."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'SportStabilityRecord plant and propagation collections match',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "SportStabilityRecord" sport
      JOIN "PlantInstance" instance ON instance.id = sport."plantInstanceId"
      JOIN "PropagationEvent" event ON event.id = sport."propagationEventId"
      WHERE instance."collectionId" IS DISTINCT FROM event."collectionId"
    `,
  },
  {
    label: 'ReminderDelivery.collectionId matches Reminder.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "ReminderDelivery" delivery
      JOIN "Reminder" reminder ON reminder.id = delivery."reminderId"
      WHERE delivery."collectionId" IS DISTINCT FROM reminder."collectionId"
    `,
  },
  {
    label: 'FollowNotification.collectionId matches Follow.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "FollowNotification" notification
      JOIN "Follow" follow ON follow.id = notification."followId"
      WHERE notification."collectionId" IS DISTINCT FROM follow."collectionId"
    `,
  },
  {
    label: 'Plant instance photos stay in the plant collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Photo" photo
      JOIN "PlantInstance" instance ON instance.id = photo."entityId"
      WHERE photo."entityType" = 'PLANT_INSTANCE'
        AND photo."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'Plant definition photos stay in the definition collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Photo" photo
      JOIN "PlantDefinition" definition ON definition.id = photo."entityId"
      WHERE photo."entityType" = 'PLANT_DEFINITION'
        AND photo."collectionId" IS DISTINCT FROM definition."collectionId"
    `,
  },
  {
    label: 'Bloom photos stay in the bloom collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Photo" photo
      JOIN "BloomEvent" bloom ON bloom.id = photo."entityId"
      WHERE photo."entityType" = 'BLOOM_EVENT'
        AND photo."collectionId" IS DISTINCT FROM bloom."collectionId"
    `,
  },
  {
    label: 'Plant instance notes stay in the plant collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Note" note
      JOIN "PlantInstance" instance ON instance.id = note."entityId"
      WHERE note."entityType" = 'PLANT_INSTANCE'
        AND note."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'Bloom notes stay in the bloom collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Note" note
      JOIN "BloomEvent" bloom ON bloom.id = note."entityId"
      WHERE note."entityType" = 'BLOOM_EVENT'
        AND note."collectionId" IS DISTINCT FROM bloom."collectionId"
    `,
  },
  {
    label: 'Propagation notes stay in the propagation collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Note" note
      JOIN "PropagationEvent" event ON event.id = note."entityId"
      WHERE note."entityType" = 'PROPAGATION_EVENT'
        AND note."collectionId" IS DISTINCT FROM event."collectionId"
    `,
  },
  {
    label: 'Plant instance follows stay in the plant collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Follow" follow
      JOIN "PlantInstance" instance ON instance.id = follow."entityId"
      WHERE follow."entityType" = 'PLANT_INSTANCE'
        AND follow."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'Plant definition follows stay in the definition collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Follow" follow
      JOIN "PlantDefinition" definition ON definition.id = follow."entityId"
      WHERE follow."entityType" = 'PLANT_DEFINITION'
        AND follow."collectionId" IS DISTINCT FROM definition."collectionId"
    `,
  },
  {
    label: 'Plant instance reminders stay in the plant collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Reminder" reminder
      JOIN "PlantInstance" instance ON instance.id = reminder."entityId"
      WHERE reminder."entityType" = 'PLANT_INSTANCE'
        AND reminder."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'Bloom reminders stay in the bloom collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Reminder" reminder
      JOIN "BloomEvent" bloom ON bloom.id = reminder."entityId"
      WHERE reminder."entityType" = 'BLOOM_EVENT'
        AND reminder."collectionId" IS DISTINCT FROM bloom."collectionId"
    `,
  },
  {
    label: 'Propagation reminders stay in the propagation collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Reminder" reminder
      JOIN "PropagationEvent" event ON event.id = reminder."entityId"
      WHERE reminder."entityType" = 'PROPAGATION_EVENT'
        AND reminder."collectionId" IS DISTINCT FROM event."collectionId"
    `,
  },
  {
    label: 'Collection-domain audit logs include collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "AuditLog" audit
      WHERE audit."entityType" IN (
        'COLLECTION',
        'COLLECTION_MEMBERSHIP',
        'GOVERNING_BODY',
        'PLANT_DEFINITION',
        'PLANT_INSTANCE',
        'NOTE',
        'PHOTO',
        'BLOOM_EVENT',
        'PROPAGATION_EVENT',
        'REMINDER',
        'FOLLOW',
        'SPORT_STABILITY_RECORD',
        'DEMO_DATA'
      )
        AND audit."collectionId" IS NULL
    `,
  },
  {
    label: 'Existing plant-definition audit logs stay in the definition collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "AuditLog" audit
      JOIN "PlantDefinition" definition ON definition.id = audit."entityId"
      WHERE audit."entityType" = 'PLANT_DEFINITION'
        AND audit."collectionId" IS DISTINCT FROM definition."collectionId"
    `,
  },
  {
    label: 'Existing plant-instance audit logs stay in the plant collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "AuditLog" audit
      JOIN "PlantInstance" instance ON instance.id = audit."entityId"
      WHERE audit."entityType" = 'PLANT_INSTANCE'
        AND audit."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'Existing bloom audit logs stay in the bloom collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "AuditLog" audit
      JOIN "BloomEvent" bloom ON bloom.id = audit."entityId"
      WHERE audit."entityType" = 'BLOOM_EVENT'
        AND audit."collectionId" IS DISTINCT FROM bloom."collectionId"
    `,
  },
  {
    label: 'Existing propagation audit logs stay in the propagation collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "AuditLog" audit
      JOIN "PropagationEvent" event ON event.id = audit."entityId"
      WHERE audit."entityType" = 'PROPAGATION_EVENT'
        AND audit."collectionId" IS DISTINCT FROM event."collectionId"
    `,
  },
]

async function rawCount(sql: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(sql)
  return Number(rows[0]?.count || 0)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Run this check on the server or in a local environment with database access.')
  }

  const findings: string[] = []

  for (const [label, delegateName] of requiredCollectionModels) {
    const delegate = (prisma as unknown as Record<string, { count: (args: unknown) => Promise<number> }>)[delegateName]
    const count = await delegate.count({ where: { collectionId: null } })
    if (count > 0) findings.push(`${label}: ${count} row(s) with null collectionId`)
  }

  for (const check of relationshipChecks) {
    const count = await rawCount(check.sql)
    if (count > 0) findings.push(`${check.label}: ${count} mismatched row(s)`)
  }

  if (findings.length > 0) {
    console.error('Collection integrity check failed:')
    for (const finding of findings) console.error(`- ${finding}`)
    process.exit(1)
  }

  console.info('Collection integrity check passed.')
}

main()
  .catch((error) => {
    console.error('Collection integrity check could not run.')
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
