import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const requiredCollectionModels = [
  ['GoverningBody', 'governingBody'],
  ['PlantDefinition', 'plantDefinition'],
  ['PlantAlias', 'plantAlias'],
  ['LocationType', 'locationType'],
  ['Location', 'location'],
  ['PlantLocationMove', 'plantLocationMove'],
  ['PlantInstance', 'plantInstance'],
  ['PropagationEvent', 'propagationEvent'],
  ['BloomEvent', 'bloomEvent'],
  ['Note', 'note'],
  ['Photo', 'photo'],
  ['ImageModerationReview', 'imageModerationReview'],
  ['PlantIdentificationLog', 'plantIdentificationLog'],
  ['Reminder', 'reminder'],
  ['ReminderDelivery', 'reminderDelivery'],
  ['Follow', 'follow'],
  ['FollowNotification', 'followNotification'],
  ['Sunshine', 'sunshine'],
  ['CollectionUpdateDigestDelivery', 'collectionUpdateDigestDelivery'],
  ['PlantHusbandryGuide', 'plantHusbandryGuide'],
  ['PlantHusbandryOverride', 'plantHusbandryOverride'],
  ['PlantCareEvent', 'plantCareEvent'],
  ['PlantCondition', 'plantCondition'],
  ['PlantCareAdjustment', 'plantCareAdjustment'],
  ['CareSheet', 'careSheet'],
  ['CareSheetPlant', 'careSheetPlant'],
  ['CareSheetTask', 'careSheetTask'],
  ['CareSheetAccessLog', 'careSheetAccessLog'],
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
    label: 'Every active collection has at least one active manager',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Collection" collection
      WHERE collection.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1
          FROM "CollectionMembership" membership
          WHERE membership."collectionId" = collection.id
            AND membership.status = 'ACTIVE'
            AND membership.role = 'MANAGER'
        )
    `,
  },
  {
    label: 'Initial server admin account exists',
    sql: `
      SELECT CASE
        WHEN COUNT(*) FILTER (WHERE email = 'admin@axildb.com' AND role = 'SERVER_ADMIN') = 1 THEN 0
        ELSE 1
      END AS count
      FROM "User"
    `,
  },
  {
    label: 'Legacy global user roles have been migrated',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "User"
      WHERE role IN ('ADMIN', 'LOGGER', 'VIEWER')
    `,
  },
  {
    label: 'Legacy collection membership roles have been migrated',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "CollectionMembership"
      WHERE role IN ('OWNER', 'ADMIN')
    `,
  },
  {
    label: 'Archived collections are not default collections',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Collection"
      WHERE status = 'ARCHIVED'
        AND "isDefault" = true
    `,
  },
  {
    label: 'Active public/private collections use known visibility values',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Collection"
      WHERE status = 'ACTIVE'
        AND visibility NOT IN ('PUBLIC', 'PRIVATE')
    `,
  },
  {
    label: 'Collection invitations use known roles',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "CollectionInvitation"
      WHERE role NOT IN ('VIEWER', 'LOGGER', 'GARDENER', 'MANAGER')
    `,
  },
  {
    label: 'Collection invitations stay in known statuses',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "CollectionInvitation"
      WHERE status NOT IN ('PENDING', 'ACCEPTED', 'REJECTED')
    `,
  },
  {
    label: 'Transfer connections use known statuses',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "CollectionTransferConnection"
      WHERE status NOT IN ('PENDING', 'ACTIVE', 'IGNORED', 'BLOCKED')
    `,
  },
  {
    label: 'Transfer requests use known statuses',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantTransferRequest"
      WHERE status NOT IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')
    `,
  },
  {
    label: 'Definition share requests use known statuses',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantDefinitionShareRequest"
      WHERE status NOT IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')
    `,
  },
  {
    label: 'Transfer connections do not point to the same collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "CollectionTransferConnection"
      WHERE "sourceCollectionId" = "targetCollectionId"
    `,
  },
  {
    label: 'Plant transfer source plant stays in source collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantTransferRequest" request
      JOIN "PlantInstance" instance ON instance.id = request."sourcePlantInstanceId"
      WHERE request."sourceCollectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'Plant transfer target plant stays in target collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantTransferRequest" request
      JOIN "PlantInstance" instance ON instance.id = request."targetPlantInstanceId"
      WHERE request."targetPlantInstanceId" IS NOT NULL
        AND request."targetCollectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'Plant transfers match their connection collections',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantTransferRequest" request
      JOIN "CollectionTransferConnection" connection ON connection.id = request."connectionId"
      WHERE request."sourceCollectionId" IS DISTINCT FROM connection."sourceCollectionId"
        OR request."targetCollectionId" IS DISTINCT FROM connection."targetCollectionId"
    `,
  },
  {
    label: 'Definition share source definition stays in source collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantDefinitionShareRequest" request
      JOIN "PlantDefinition" definition ON definition.id = request."sourcePlantDefinitionId"
      WHERE request."sourceCollectionId" IS DISTINCT FROM definition."collectionId"
    `,
  },
  {
    label: 'Definition share target definition stays in target collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantDefinitionShareRequest" request
      JOIN "PlantDefinition" definition ON definition.id = request."targetPlantDefinitionId"
      WHERE request."targetPlantDefinitionId" IS NOT NULL
        AND request."targetCollectionId" IS DISTINCT FROM definition."collectionId"
    `,
  },
  {
    label: 'Definition shares match their connection collections',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantDefinitionShareRequest" request
      JOIN "CollectionTransferConnection" connection ON connection.id = request."connectionId"
      WHERE request."sourceCollectionId" IS DISTINCT FROM connection."sourceCollectionId"
        OR request."targetCollectionId" IS DISTINCT FROM connection."targetCollectionId"
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
    label: 'PlantHusbandryGuide.collectionId matches PlantDefinition.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantHusbandryGuide" guide
      JOIN "PlantDefinition" definition ON definition.id = guide."plantDefinitionId"
      WHERE guide."collectionId" IS DISTINCT FROM definition."collectionId"
    `,
  },
  {
    label: 'Linked husbandry guides stay in one collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantHusbandryGuide" guide
      JOIN "PlantDefinition" source ON source.id = guide."sourcePlantDefinitionId"
      WHERE guide."sourcePlantDefinitionId" IS NOT NULL
        AND guide."collectionId" IS DISTINCT FROM source."collectionId"
    `,
  },
  {
    label: 'PlantHusbandryOverride.collectionId matches PlantInstance.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantHusbandryOverride" override
      JOIN "PlantInstance" instance ON instance.id = override."plantInstanceId"
      WHERE override."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'PlantCareEvent.collectionId matches PlantInstance.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantCareEvent" event
      JOIN "PlantInstance" instance ON instance.id = event."plantInstanceId"
      WHERE event."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'PlantCondition.collectionId matches PlantInstance.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantCondition" condition
      JOIN "PlantInstance" instance ON instance.id = condition."plantInstanceId"
      WHERE condition."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'PlantCareAdjustment.collectionId matches PlantInstance.collectionId',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantCareAdjustment" adjustment
      JOIN "PlantInstance" instance ON instance.id = adjustment."plantInstanceId"
      WHERE adjustment."collectionId" IS DISTINCT FROM instance."collectionId"
    `,
  },
  {
    label: 'Plant husbandry guides do not link to themselves',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "PlantHusbandryGuide"
      WHERE "plantDefinitionId" = "sourcePlantDefinitionId"
    `,
  },
  {
    label: 'Plant husbandry guides do not form circular links',
    sql: `
      WITH RECURSIVE guide_links AS (
        SELECT
          guide."plantDefinitionId" AS root,
          guide."sourcePlantDefinitionId" AS current,
          ARRAY[guide."plantDefinitionId"] AS path,
          false AS cycle
        FROM "PlantHusbandryGuide" guide
        WHERE guide."sourcePlantDefinitionId" IS NOT NULL
        UNION ALL
        SELECT
          guide_links.root,
          next_guide."sourcePlantDefinitionId" AS current,
          guide_links.path || next_guide."plantDefinitionId",
          next_guide."plantDefinitionId" = ANY(guide_links.path) AS cycle
        FROM guide_links
        JOIN "PlantHusbandryGuide" next_guide ON next_guide."plantDefinitionId" = guide_links.current
        WHERE guide_links.current IS NOT NULL
          AND NOT guide_links.cycle
      )
      SELECT COUNT(*)::int AS count
      FROM guide_links
      WHERE cycle = true
    `,
  },
  {
    label: 'Plant IDs are unique within each collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT "collectionId", "plantId"
        FROM "PlantInstance"
        GROUP BY "collectionId", "plantId"
        HAVING COUNT(*) > 1
      ) duplicates
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
        'PLANT_HUSBANDRY_GUIDE',
        'PLANT_HUSBANDRY_OVERRIDE',
        'PLANT_CARE_EVENT',
        'PLANT_CONDITION',
        'PLANT_CARE_ADJUSTMENT',
        'TRANSFER_CONNECTION',
        'PLANT_TRANSFER_REQUEST',
        'PLANT_DEFINITION_SHARE_REQUEST',
        'DEMO_DATA'
      )
        AND audit."collectionId" IS NULL
    `,
  },
  {
    label: 'Plant-instance sunshine stays in the plant collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Sunshine" sunshine
      LEFT JOIN "PlantInstance" instance ON instance.id = sunshine."targetId"
      WHERE sunshine."targetType" = 'PLANT_INSTANCE'
        AND (
          instance.id IS NULL
          OR sunshine."collectionId" IS DISTINCT FROM instance."collectionId"
        )
    `,
  },
  {
    label: 'Bloom sunshine stays in the bloom collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Sunshine" sunshine
      LEFT JOIN "BloomEvent" bloom ON bloom.id = sunshine."targetId"
      WHERE sunshine."targetType" = 'BLOOM_EVENT'
        AND (
          bloom.id IS NULL
          OR sunshine."collectionId" IS DISTINCT FROM bloom."collectionId"
        )
    `,
  },
  {
    label: 'Photo sunshine stays in the photo collection',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "Sunshine" sunshine
      LEFT JOIN "Photo" photo ON photo.id = sunshine."targetId"
      WHERE sunshine."targetType" = 'PHOTO'
        AND (
          photo.id IS NULL
          OR photo."entityType" = 'PLANT_DEFINITION'
          OR sunshine."collectionId" IS DISTINCT FROM photo."collectionId"
        )
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
