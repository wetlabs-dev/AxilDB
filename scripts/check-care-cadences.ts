import assert from 'node:assert/strict'
import { cadenceDueAt, cadenceLabel, resolveCadence, validateCadence } from '../lib/care-cadences'
import { dateInputValue, parseDateLocal } from '../lib/time'

const defaults = [{ activity: 'WATERING', interval: 7, unit: 'DAY' }]
const custom = [{ activity: 'WATERING', mode: 'OVERRIDE', interval: 5, unit: 'DAY' }]
const disabled = [{ activity: 'WATERING', mode: 'DISABLED', interval: null, unit: null }]
assert.equal(resolveCadence('WATERING', defaults).cadence?.interval, 7)
assert.equal(resolveCadence('WATERING', [{ ...defaults[0], interval: 9 }]).cadence?.interval, 9)
assert.equal(resolveCadence('WATERING', defaults, custom).cadence?.interval, 5)
assert.equal(resolveCadence('WATERING', [{ ...defaults[0], interval: 9 }], custom).cadence?.interval, 5)
assert.equal(resolveCadence('WATERING', defaults, disabled).cadence, null)
assert.equal(resolveCadence('WATERING', [], disabled).source, 'Disabled')
assert.equal(resolveCadence('WATERING', defaults, []).source, 'From definition')
assert.equal(resolveCadence('WATERING', [], []).source, 'Not scheduled')
for (const interval of [0, -1, 1.5, NaN, Infinity, 3651]) assert.throws(() => validateCadence(interval, 'DAY'))
assert.throws(() => validateCadence(7, 'FORTNIGHT'))
assert.equal(cadenceLabel({ interval: 2, unit: 'WEEK' }), 'Every 2 weeks')
assert.equal(cadenceLabel({ interval: 1, unit: 'YEAR' }), 'Every 1 year')
const tz = 'America/New_York'
const date = (s: string) => parseDateLocal(s, tz)!
const due = (s: string, interval: number, unit: string) => dateInputValue(cadenceDueAt(date(s), { activity: 'WATERING', interval, unit }, tz), tz)
assert.equal(due('2026-01-31', 1, 'MONTH'), '2026-02-28')
assert.equal(due('2024-01-31', 1, 'MONTH'), '2024-02-29')
assert.equal(due('2024-02-29', 1, 'YEAR'), '2025-02-28')
assert.equal(due('2026-12-31', 2, 'MONTH'), '2027-02-28')
assert.equal(due('2026-03-07', 2, 'DAY'), '2026-03-09')
assert.equal(due('2026-10-12', 1, 'WEEK'), '2026-10-19')
assert.equal(due('2026-10-17', 1, 'WEEK'), '2026-10-24')
assert.equal(cadenceDueAt(null, defaults[0], tz), null)
assert.equal(cadenceDueAt(date('2026-10-12'), null, tz), null)
console.log('Care cadence inheritance, validation, and calendar checks passed.')
