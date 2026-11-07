import { proposedQuietDays } from '../lib/care-forecast-service'
import assert from 'node:assert/strict'
import { calendarSchedule, careForecast, effectiveQuietRules, quietDateReasons, type CalendarConfig, type QuietDate } from '../lib/care-calendar'
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
assert.equal(daily[0].schedulingConflict, true)
const noDestination = calendarSchedule([task('blocked')], { ...config, quietDays: [{ ...quiet, quietType: 'DATE_RANGE', date: null, startDate: date('2026-10-18'), endDate: date('2026-10-24') }] }, now)
assert.equal(dateInputValue(noDestination[0].dueAt, timezone), '2026-10-20')
assert.equal(noDestination[0].schedulingConflict, true)
const saved = new Map([['fern', { originalDueAt: date('2026-10-20'), adjustedDueAt: date('2026-10-19'), ruleUsed: 'old', reason: 'Moved earlier', shiftDirection: 'EARLIER', quietDayId: 'quiet' }]])
assert.equal(dateInputValue(calendarSchedule([task('fern')], { ...config, quietDays: [] }, new Date('2026-10-20T12:00Z'), saved, 'new')[0].dueAt, timezone), '2026-10-20', 'Explicit calendar changes restore the cadence date; ordinary reads preserve advanced work.')
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

// Scoped rules use the same calendar engine as collection-wide care.
const weekend: CalendarConfig = { ...config, quietDays: [6, 0].map(dayOfWeek => ({ ...quiet, id: `office-${dayOfWeek}`, name: 'Office weekend', locationId: 'office', quietType: 'WEEKLY_RECURRING', date: null, dayOfWeek })) }
const office = (key: string, due = '2026-10-24', cadence = 3) => ({ ...task(key, 'WATER', due, cadence), locationId: 'office', locationName: 'Work Office' })
const weekendPlan = calendarSchedule([office('sat-fern'), office('sun-fern', '2026-10-25'), office('succulent', '2026-10-24', 21), { ...task('home', 'WATER', '2026-10-24'), locationId: 'home' }], weekend, now)
assert.equal(dateInputValue(weekendPlan.find(item => item.key === 'sat-fern')!.dueAt, timezone), '2026-10-23')
assert.equal(dateInputValue(weekendPlan.find(item => item.key === 'sun-fern')!.dueAt, timezone), '2026-10-23')
assert.equal(dateInputValue(weekendPlan.find(item => item.key === 'succulent')!.dueAt, timezone), '2026-10-26')
assert.equal(dateInputValue(weekendPlan.find(item => item.key === 'home')!.dueAt, timezone), '2026-10-24')
const scopedForecast = careForecast(weekendPlan, weekend, now)
assert.equal(scopedForecast[5].quietDay, null, 'Office quiet does not mean globally quiet.')
assert.equal(scopedForecast[5].total, 1)
assert.equal(scopedForecast[5].restrictions.length, 1)
const union = { ...weekend, quietDays: [...weekend.quietDays, { ...quiet, id: 'collection-sunday', quietType: 'WEEKLY_RECURRING', date: null, dayOfWeek: 0 }] }

assert.equal(quietDateReasons(date('2026-10-25'), union, 'office').length, 2)
assert.equal(quietDateReasons(date('2026-10-25'), union, 'home').length, 1)
assert.equal(quietDateReasons(date('2026-10-24'), weekend, 'office-child').length, 0, 'No implicit parent inheritance.')
assert.equal(effectiveQuietRules(weekend.quietDays, 'home').length, 0)
const vacation = { ...weekend, quietDays: [{ ...quiet, locationId: 'office', quietType: 'DATE_RANGE', date: null, startDate: date('2026-12-24'), endDate: date('2027-01-03') }] }
const unsafe = calendarSchedule([office('closure', '2026-12-29')], vacation, date('2026-12-20'))
assert.equal(dateInputValue(unsafe[0].dueAt, timezone), '2026-12-29')
assert.equal(unsafe[0].schedulingConflict, true)
assert.equal(quietDateReasons(date('2027-01-01'), vacation, 'office').length, 1)
assert.equal(quietDateReasons(date('2027-01-01'), vacation, 'home').length, 0)
const manualOffice = calendarSchedule([{ ...office('manual-office'), manualSchedule: true }], weekend, now)
assert.equal(dateInputValue(manualOffice[0].dueAt, timezone), '2026-10-24')
assert.match(manualOffice[0].quietDayReason!, /explicit/)

const weekdaysDraft = proposedQuietDays(union, { kind: 'weekly', locationId: 'office', weekdays: [6,0,6] }, 'collection')
assert.equal(weekdaysDraft.length, 3, 'Weekday deduplication preserves collection rules.')
assert.equal(proposedQuietDays(union, { kind: 'weekly', locationId: 'office', weekdays: [] }, 'collection').length, 1, 'Removing local weekdays never cancels collection restrictions.')
assert.throws(() => proposedQuietDays(config, { kind: 'weekly', weekdays: [7] }, 'collection'))
assert.throws(() => proposedQuietDays(config, { kind: 'create', name: '', quietType: 'DATE_RANGE', startDate: '2027-01-03', endDate: '2026-12-24' }, 'collection'))
console.log('Scoped calendar: office weekends, additive inheritance, overlap provenance, isolated locations, year-crossing closures, safety exceptions, manual dates and weekday validation passed.')

// Reproduce the reported sequential edit after Thursday's shifted work becomes due.
const thursday = date('2026-10-22')
const friday = date('2026-10-23')
const sequentialTask = task('sequential', 'WATER', '2026-10-22', 21)
const thursdayQuiet = { ...quiet, id: 'thursday', date: thursday }
const fridayQuiet = { ...quiet, id: 'friday', date: friday }
const firstConfig = { ...config, quietDays: [thursdayQuiet] }
const bothConfig = { ...config, quietDays: [thursdayQuiet, fridayQuiet] }
const firstShift = calendarSchedule([sequentialTask], firstConfig, now)[0]
assert.equal(dateInputValue(firstShift.dueAt, timezone), '2026-10-23')
const materialized = new Map([[sequentialTask.key, { originalDueAt: thursday, adjustedDueAt: firstShift.dueAt, ruleUsed: 'thursday-only', reason: firstShift.quietDayReason!, shiftDirection: 'LATER', quietDayId: thursdayQuiet.id }]])
const revised = calendarSchedule([sequentialTask], bothConfig, friday, materialized, 'both')[0]
assert.equal(dateInputValue(revised.dueAt, timezone), '2026-10-24', 'New quiet days must invalidate an already-actionable automatic shift.')

const savePlan = (items: CareQueueItem[], revision: string) => new Map(items.filter(item => item.originalDueAt).map(item => [item.key, { originalDueAt: item.originalDueAt!, adjustedDueAt: item.dueAt, ruleUsed: revision, reason: item.quietDayReason!, shiftDirection: item.quietDayShiftDirection!, quietDayId: null }]))
const signature = (items: CareQueueItem[]) => items.map(item => [item.key, dateInputValue(item.dueAt, timezone), !!item.schedulingConflict]).sort((a,b) => String(a[0]).localeCompare(String(b[0])))
const assortment = [3,7,14,30].flatMap(days => ['2026-10-22','2026-10-23'].map(due => task(`${days}-${due}`, 'WATER', due, days))).concat(['PEST_CHECK','HEALTH_CHECK','FERTILIZE','REPOT','PRUNE'].flatMap(type => ['2026-10-22','2026-10-23'].map(due => task(`${type}-${due}`, type, due))))
const together = calendarSchedule(assortment, bothConfig, now)
for (const initial of [thursdayQuiet, fridayQuiet]) {
  const first = calendarSchedule(assortment, { ...config, quietDays: [initial] }, now)
  assert.deepEqual(signature(calendarSchedule(assortment, bothConfig, now, savePlan(first, 'first'), 'both')), signature(together), 'Calendar edits converge regardless of creation order.')
}
assert.deepEqual(signature(calendarSchedule(together, bothConfig, now, savePlan(together, 'both'), 'both')), signature(together), 'Reconciliation is idempotent, including already-adjusted input.')
assert.deepEqual(signature(calendarSchedule(together, { ...config, quietDays: [] }, now, savePlan(together, 'both'), 'removed')), signature(assortment), 'Removing rules restores cadence dates without drift.')
for (const item of together) assert.ok(item.schedulingConflict || !quietDateReasons(item.dueAt, bothConfig, item.locationId).length)
const fullWeek = { ...config, quietDays: Array.from({ length: 7 }, (_, dayOfWeek) => ({ ...quiet, id: `week-${dayOfWeek}`, quietType: 'WEEKLY_RECURRING', date: null, dayOfWeek })) }
const allBlocked = calendarSchedule(assortment, fullWeek, now)
assert.ok(allBlocked.every(item => item.schedulingConflict))
const blockedForecast = careForecast(allBlocked, fullWeek, now)
assert.equal(blockedForecast.reduce((sum, day) => sum + day.total, 0), 0)
assert.equal(blockedForecast.reduce((sum, day) => sum + day.conflicts.length, 0), assortment.length, 'Conflicts remain visible without masquerading as scheduled tasks.')
const protectedTasks = [{ ...task('done'), completedAt: now }, { ...task('snoozed'), manualSchedule: true }, { ...task('workflow', 'HEALTH_CHECK'), manualSchedule: true }]
assert.deepEqual(signature(calendarSchedule(protectedTasks, fullWeek, now)), signature(protectedTasks))
// Seeded invariant checks require no additional testing dependency.
let seed = 90127
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
for (const start of ['2026-03-06','2026-10-29','2026-12-28','2028-02-26']) {
  for (let run = 0; run < 25; run++) {
    const origin = date(start)
    const rules: QuietDate[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({ ...quiet, id: `rule-${dayOfWeek}`, active: random() > .35, locationId: random() > .5 ? 'office' : null, quietType: 'WEEKLY_RECURRING', date: null, dayOfWeek }))
    rules.push({ ...quiet, id: 'one-off', locationId: null, date: addCalendarDays(origin, 4, timezone) })
    const cfg = { ...config, quietDays: rules }
    const inputs = Array.from({ length: 24 }, (_, i) => ({ ...task(`generated-${i}`, ['WATER','PEST_CHECK','FERTILIZE','REPOT'][i % 4], dateInputValue(addCalendarDays(origin, 1 + i % 7, timezone), timezone), [3,7,14,30][i % 4]), locationId: i % 2 ? 'office' : 'home' }))
    const output = calendarSchedule(inputs, cfg, origin)
    assert.equal(output.length, inputs.length)
    assert.equal(new Set(output.map(item => item.key)).size, inputs.length)
    for (const item of output) assert.ok(item.schedulingConflict || !quietDateReasons(item.dueAt, cfg, item.locationId).length)
    assert.deepEqual(signature(calendarSchedule(inputs, cfg, origin, savePlan(output, 'current'), 'current')), signature(output))
    assert.deepEqual(signature(calendarSchedule(inputs, { ...cfg, quietDays: [...rules].reverse() }, origin)), signature(output))
  }
}
console.log('Quiet Day reliability: sequential actionable edits reproduced, edit-order convergence, stable cadence anchors, explicit conflicts, protected tasks, full quiet week and 100 generated calendar invariants passed.')

for (const length of [3,5]) {
  const cfg = { ...config, quietDays: [{ ...quiet, quietType: 'DATE_RANGE', date: null, startDate: thursday, endDate: addCalendarDays(thursday, length - 1, timezone) }] }
  const output = calendarSchedule(assortment, cfg, now)
  for (const item of output) assert.ok(item.schedulingConflict || !quietDateReasons(item.dueAt, cfg, item.locationId).length)
}
