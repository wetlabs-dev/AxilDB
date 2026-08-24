import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { careQueueLocationFilters, careQueueLocationSections } from '../lib/care-queue-locations'
import { descendantLocationIds, locationPathWithCodes, type LocationNode } from '../lib/locations'

const schema = readFileSync('prisma/schema.prisma', 'utf8')
const instanceModel = schema.match(/model PlantInstance \{[\s\S]*?\n\}/)?.[0] || ''
assert(!/^\s+location\s+String\?/m.test(instanceModel), 'PlantInstance.location must be removed')
assert(!instanceModel.includes('legacyLocationText'), 'PlantInstance.legacyLocationText must be removed')

const migration = readFileSync('prisma/migrations/20260824120000_canonical_plant_locations/migration.sql', 'utf8')
assert(migration.includes('HAVING COUNT(*) = 1'), 'legacy matching must reject ambiguous names')
assert(migration.includes('unresolved_count > 0'), 'migration must abort before dropping unresolved values')
assert(migration.includes('DROP COLUMN "location"'), 'legacy text column must be dropped')

const type = { name: 'Room', abbreviation: 'RM' }
const locations: LocationNode[] = [
  { id: 'office', parentLocationId: null, name: 'Office', code: 'LOC-RM-01', status: 'ACTIVE', sortOrder: 10, locationType: type },
  { id: 'cabinet', parentLocationId: 'office', name: 'Cabinet', code: 'LOC-CAB-01', status: 'ACTIVE', sortOrder: 10, locationType: type },
  { id: 'shelf', parentLocationId: 'cabinet', name: 'Shelf 2', code: 'LOC-SHF-02', status: 'ACTIVE', sortOrder: 10, locationType: type },
  { id: 'greenhouse', parentLocationId: null, name: 'Greenhouse', code: 'LOC-GH-01', status: 'ACTIVE', sortOrder: 20, locationType: type },
]
assert.equal(locationPathWithCodes('shelf', locations), 'LOC-RM-01 Office / LOC-CAB-01 Cabinet / LOC-SHF-02 Shelf 2')
assert.deepEqual(Array.from(descendantLocationIds('office', locations)).sort(), ['cabinet', 'shelf'])

const item = (key: string, locationId: string | null, overdueDays = 0) => ({
  key, locationId, locationName: locationId, locationPath: locationId, taskType: 'WATER' as const, source: 'derived' as const,
  title: key, reason: key, dueAt: new Date('2026-08-24'), priority: 1, overdueDays, href: '/',
})
const items = [item('a', 'shelf', 2), item('b', 'greenhouse'), item('c', null)]
assert.deepEqual(careQueueLocationFilters(items, locations).map((entry) => entry.id), ['shelf', 'greenhouse'])
assert.deepEqual(careQueueLocationFilters(items, locations, 'parent').map((entry) => entry.id), ['office', 'greenhouse'])
assert.deepEqual(careQueueLocationSections(items, locations, 'parent', 'tree').map((entry) => entry.id), ['office', 'greenhouse', 'unassigned'])
assert.deepEqual(careQueueLocationSections(items, locations, 'flat', 'overdue').map((entry) => entry.id), ['shelf', 'greenhouse', 'unassigned'])

console.log('Canonical Location and Care Queue grouping checks passed.')
