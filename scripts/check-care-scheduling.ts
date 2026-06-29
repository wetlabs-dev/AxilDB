import assert from 'node:assert/strict'
import { normalizeCareTypes, resolveQuietDayShift } from '../lib/care-scheduling'

const timezone = 'America/New_York'
const quietDays = [
  {
    id: 'quiet-weekly',
    name: 'Sunday rest',
    quietType: 'WEEKLY_RECURRING',
    date: null,
    startDate: null,
    endDate: null,
    dayOfWeek: 0,
    active: true,
  },
  {
    id: 'quiet-date',
    name: 'Show day',
    quietType: 'ONE_TIME',
    date: new Date('2026-07-04T04:00:00.000Z'),
    startDate: null,
    endDate: null,
    dayOfWeek: null,
    active: true,
  },
]

const sundayDue = new Date('2026-07-05T13:00:00.000Z')
const pestShift = resolveQuietDayShift({
  dueAt: sundayDue,
  careType: 'PEST_CHECK',
  quietDays,
  rule: { defaultShiftDirection: 'EARLIER', maxShiftDaysBefore: 2, maxShiftDaysAfter: 1, active: true },
  timezone,
})

assert.equal(pestShift?.quietDay.name, 'Sunday rest')
assert.equal(pestShift?.shiftDirection, 'EARLIER')
assert.equal(pestShift?.adjustedDueAt.toISOString(), '2026-07-03T13:00:00.000Z')

const reminderShift = resolveQuietDayShift({
  dueAt: sundayDue,
  careType: 'REMINDER',
  quietDays,
  rule: { defaultShiftDirection: 'LATER', maxShiftDaysBefore: 1, maxShiftDaysAfter: 2, active: true },
  timezone,
})

assert.equal(reminderShift?.shiftDirection, 'LATER')
assert.equal(reminderShift?.adjustedDueAt.toISOString(), '2026-07-06T13:00:00.000Z')

const normalDay = resolveQuietDayShift({
  dueAt: new Date('2026-07-06T13:00:00.000Z'),
  careType: 'WATER',
  quietDays,
  rule: null,
  timezone,
})

assert.equal(normalDay, null)
assert.deepEqual(normalizeCareTypes(['WATER', 'WATER', 'NOPE', 'REMINDER']), ['WATER', 'REMINDER'])

console.log('Care scheduling checks passed.')
