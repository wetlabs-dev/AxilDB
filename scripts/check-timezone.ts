import assert from 'assert/strict'
import { nextOccurrence } from '@/lib/reminders'
import { formatDateTime, parseDateTimeLocal, startOfDayInTimeZone } from '@/lib/time'

const timezone = 'America/New_York'

const first = parseDateTimeLocal('2026-03-07T00:00', timezone)
assert(first, 'datetime-local input should parse')
assert.equal(first.toISOString(), '2026-03-07T05:00:00.000Z')

const second = nextOccurrence(first, 'FREQ=DAILY', timezone)
assert(second, 'daily recurrence should produce the next date')
assert.equal(second.toISOString(), '2026-03-08T05:00:00.000Z')

const third = nextOccurrence(second, 'FREQ=DAILY', timezone)
assert(third, 'daily recurrence should survive the DST boundary')
assert.equal(third.toISOString(), '2026-03-09T04:00:00.000Z')

const localStart = startOfDayInTimeZone(new Date('2026-06-01T12:00:00.000Z'), timezone)
assert.equal(localStart.toISOString(), '2026-06-01T04:00:00.000Z')

console.log(`Timezone checks passed for ${timezone}: ${formatDateTime(third, timezone)}`)
