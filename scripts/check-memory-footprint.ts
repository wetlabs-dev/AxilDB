import { prisma } from '@/lib/prisma'
import { collectServerMetricData, formatBytes } from '@/lib/server-metrics'

const GALLERY_SAMPLE_SIZE = 96
const SEARCH_SAMPLE_SIZE = 80

function payloadBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value))
}

async function main() {
  const collections = await prisma.collection.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  })

  console.log(`Collections: ${collections.length}`)

  for (const collection of collections) {
    const [
      plantDefinitions,
      plantInstances,
      photos,
      events,
      gallerySample,
      searchInstanceSample,
      searchDefinitionSample,
    ] = await Promise.all([
      prisma.plantDefinition.count({ where: { collectionId: collection.id } }),
      prisma.plantInstance.count({ where: { collectionId: collection.id } }),
      prisma.photo.count({ where: { collectionId: collection.id } }),
      prisma.domainEvent.count({ where: { collectionId: collection.id } }),
      prisma.photo.findMany({
        where: { collectionId: collection.id, entityType: { in: ['PLANT_INSTANCE', 'BLOOM_EVENT', 'PLANT_DEFINITION'] } },
        select: {
          id: true,
          path: true,
          entityType: true,
          entityId: true,
          moderationStatus: true,
          nsfwFlagged: true,
          caption: true,
          cropX: true,
          cropY: true,
          cropWidth: true,
          cropHeight: true,
          focalX: true,
          focalY: true,
          createdAt: true,
          isCover: true,
          isType: true,
        },
        orderBy: { createdAt: 'desc' },
        take: GALLERY_SAMPLE_SIZE,
      }),
      prisma.plantInstance.findMany({
        where: { collectionId: collection.id },
        select: {
          id: true,
          plantId: true,
          status: true,
          propagationDate: true,
          acquisitionDate: true,
          plantDefinition: {
            select: { genus: true, species: true, hybridNotation: true, cultivarName: true, authority: true, provisionalTaxon: true, identificationStatus: true },
          },
          currentSubstrate: {
            select: {
              substrateMode: true,
              recipeVersion: { select: { versionNumber: true, recipe: { select: { name: true } } } },
            },
          },
        },
        orderBy: { plantId: 'asc' },
        take: SEARCH_SAMPLE_SIZE,
      }),
      prisma.plantDefinition.findMany({
        where: { collectionId: collection.id },
        select: {
          id: true,
          isValidated: true,
          genus: true,
          species: true,
          hybridNotation: true,
          cultivarName: true,
          authority: true,
          provisionalTaxon: true,
          identificationStatus: true,
          confidence: true,
          aliases: { select: { name: true }, orderBy: { name: 'asc' }, take: 8 },
          _count: { select: { instances: true } },
          tags: { select: { plantTag: { select: { id: true, name: true, icon: true, colorToken: true, publicVisible: true, active: true } } } },
        },
        orderBy: [{ isValidated: 'desc' }, { genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
        take: SEARCH_SAMPLE_SIZE,
      }),
    ])

    console.log(`\n${collection.name} /${collection.slug}`)
    console.log(`  Rows: ${plantDefinitions} definitions, ${plantInstances} instances, ${photos} photos, ${events} events`)
    console.log(`  Gallery sample payload (${gallerySample.length}): ${formatBytes(payloadBytes(gallerySample))}`)
    console.log(`  Search instance sample payload (${searchInstanceSample.length}): ${formatBytes(payloadBytes(searchInstanceSample))}`)
    console.log(`  Search definition sample payload (${searchDefinitionSample.length}): ${formatBytes(payloadBytes(searchDefinitionSample))}`)
  }

  const metrics = await collectServerMetricData()
  const usageByCollection = new Map(metrics.collections.map((collection) => [collection.id, collection]))
  console.log('\nCurrent process memory')
  console.log(`  RSS: ${formatBytes(metrics.memory.rssBytes)} (peak ${formatBytes(metrics.memory.peakRssBytes)})`)
  console.log(`  Heap: ${formatBytes(metrics.memory.heapUsedBytes)} used of ${formatBytes(metrics.memory.heapTotalBytes)}`)
  console.log(`  External + ArrayBuffers: ${formatBytes(metrics.memory.externalBytes + metrics.memory.arrayBuffersBytes)}`)
  if (metrics.memory.containerLimitBytes) {
    console.log(`  Container: ${formatBytes(metrics.memory.containerUsedBytes)} used of ${formatBytes(metrics.memory.containerLimitBytes)}`)
  }
  console.log('\nUpload storage')
  console.log(`  Total uploads: ${formatBytes(metrics.disk.uploadBytes)}`)
  for (const collection of collections) {
    const usage = usageByCollection.get(collection.id)
    console.log(`  ${collection.name}: ${formatBytes(usage?.uploadBytes || 0)}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
