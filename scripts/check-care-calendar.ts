import assert from 'node:assert/strict'
import { calendarSchedule, careForecast, type CalendarConfig } from '../lib/care-calendar'
import type { CareQueueItem } from '../lib/care-queue'
import { addCalendarDays, dateInputValue, parseDateLocal } from '../lib/time'
const timezone = 'America/New_York'
const now = new Date('2026-10-19T04:00:00Z')
const date = (value: string) => parseDateLocal(value, timezone)!
const quiet = { id: 'quiet', name: 'Rest', quietType: 'ONE_TIME', date: date('2026-10-20'), startDate: null, endDate: null, dayOfWeek: null, active: true }
const config: CalendarConfig = { timezone, quietDays: [quiet], rules: [] }
const task = (key: string, type = 'WATER', due = '2026-10-20', days = 3): CareQueueItem => ({ key, taskType: type as any, title: key, source: 'derived', dueAt: date(due), href: '/', reason: '', priority: 1, overdueDays: 0, cadenceDays: days })
const plan = calendarSchedule([task('fern'), task('succulent', 'WATER', undefined, 21), task('pest-a', 'PEST_CHECK'), task('pest-b', 'PEST_CHECK'), ...Array.from({ length: 15 }, (_, i) => ({ ...task(`busy-${i}`, 'PRUNE', '2026-10-19'), manualSchedule: true }))], config, now)
assert.equal(dateInputValue(plan.find(item => item.key === 'fern')!.dueAt, timezone), '2026-10-19')
assert.equal(dateInputValue(plan.find(item => item.key === 'succulent')!.dueAt, timezone), '2026-10-21')
assert.equal(dateInputValue(plan.find(item => item.key === 'pest-a')!.dueAt, timezone), '2026-10-21')
assert.equal(plan.find(item => item.key === 'pest-a')!.dueAt.getTime(), plan.find(item => item.key === 'pest-b')!.dueAt.getTime())
const fixed = calendarSchedule([{ ...task('manual'), manualSchedule: true }, task('overdue', 'WATER', '2026-10-18')], { ...config, quietDays: [...config.quietDays, { ...quiet, id: 'old', date: date('2026-10-18') }] }, now)
assert.equal(dateInputValue(fixed.find(item => item.key === 'manual')!.dueAt, timezone), '2026-10-20')
assert.equal(dateInputValue(fixed.find(item => item.key === 'overdue')!.dueAt, timezone), '2026-10-18')
assert.match(fixed.find(item => item.key === 'manual')!.quietDayReason!, /explicit/)
const daily = calendarSchedule([{ ...task('daily', 'WATER', '2026-10-20', 1), notBeforeDate: '2026-10-20' }], config, now)
assert.equal(dateInputValue(daily[0].dueAt, timezone), '2026-10-20', 'Never advance assessment to the day just completed.')
assert.match(daily[0].quietDayReason!, /exception/)
const noDestination = calendarSchedule([task('blocked')], { ...config, quietDays: [{ ...quiet, quietType: 'DATE_RANGE', date: null, startDate: date('2026-10-18'), endDate: date('2026-10-24') }] }, now)
assert.equal(dateInputValue(noDestination[0].dueAt, timezone), '2026-10-20')
assert.match(noDestination[0].quietDayReason!, /exception/)
const saved = new Map([['fern', { originalDueAt: date('2026-10-20'), adjustedDueAt: date('2026-10-19'), ruleUsed: 'old', reason: 'Moved earlier', shiftDirection: 'EARLIER', quietDayId: 'quiet' }]])
assert.equal(dateInputValue(calendarSchedule([task('fern')], { ...config, quietDays: [] }, new Date('2026-10-20T12:00Z'), saved, 'new')[0].dueAt, timezone), '2026-10-19', 'Unfinished advanced work remains overdue after quiet-day changes.')
const recurrence = { ...task('recur', 'WATER', '2026-10-19', 3), recurrenceCadence: { activity: 'WATERING', interval: 3, unit: 'DAY' } }
const forecast = careForecast([recurrence, task('carry', 'PEST_CHECK', '2026-10-18')], { ...config, quietDays: [] }, now)
assert.equal(forecast.length, 7); assert.equal(forecast[0].date, '2026-10-19'); assert.equal(forecast[6].date, '2026-10-25')
assert.equal(forecast[0].overdue, 1); assert.equal(forecast[0].total, 2)
assert.equal(forecast[3].categories.WATER, 1); assert.equal(forecast[6].categories.WATER, 1)
const boundary = careForecast(calendarSchedule([task('boundary', 'WATER', '2026-10-26', 3)], { ...config, quietDays: [{ ...quiet, date: date('2026-10-26') }] }, now), { ...config, quietDays: [{ ...quiet, date: date('2026-10-26') }] }, now)
assert.equal(boundary[6].total, 1, 'Day eight advances into the seven-day forecast.')
for (const [start, end] of [['2026-03-07', '2026-03-13'], ['2026-10-31', '2026-11-06'], ['2028-02-26', '2028-03-03'], ['2026-12-29', '2027-01-04']]) {
  const days = careForecast([], { timezone, quietDays: [], rules: [] }, date(start))
  assert.equal(days[6].date, end)
  for (let i = 0; i < 7; i++) assert.equal(days[i].date, dateInputValue(addCalendarDays(date(start), i, timezone), timezone))
}
const reminderDays = careForecast([{ ...task('daily-reminder', 'REMINDER', '2026-10-19'), manualSchedule: true, recurrenceRule: 'FREQ=DAILY' }], { ...config, quietDays: [] }, now)
assert.ok(reminderDays.every(day => day.categories.REMINDER === 1), 'Recurring reminders share the existing recurrence rules.')
console.log('Calendar policy: short/long watering, grouped workload, manual/overdue exceptions, bounded shifts, retained advanced work, repeated forecasts, boundary halo, DST, leap year and year/month rollover passed.')
