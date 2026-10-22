import type { Prisma, PrismaClient } from '@prisma/client'
import { isQuietDate, schedulableCareTypes } from '@/lib/care-scheduling'
import { getCareQueue } from '@/lib/care-queue'
import { careForecast, type CalendarConfig, type QuietDate } from '@/lib/care-calendar'
import { scheduleDigest } from '@/lib/care-calendar-store'
import { addCalendarDays, calendarDayIndexInTimeZone, dateInputValue, normalizeTimeZone, parseDateLocal } from '@/lib/time'
export type QuietDraft = { kind: 'set'; date: string; moveId?: string } | { kind: 'remove'; id: string } | { kind: 'rule'; careType: string; defaultShiftDirection: string; maxShiftDaysBefore: number; maxShiftDaysAfter: number; active: boolean } | { kind: 'weekly'; locationId?: string | null; weekdays: number[] } | { kind: 'create'; id?: string; locationId?: string | null; name: string; quietType: string; description?: string; active?: boolean; date?: string; startDate?: string; endDate?: string; dayOfWeek?: number }
export type ForecastScope = { collectionId: string; collectionSlug: string; userId?: string; timezone?: string; now?: Date }
export async function forecastConfiguration(db: PrismaClient | Prisma.TransactionClient, scope: ForecastScope): Promise<CalendarConfig> {
  const [quietDays, rules] = await Promise.all([
    db.collectionQuietDay.findMany({ where: { collectionId: scope.collectionId }, orderBy: { id: 'asc' } }),
    db.collectionQuietDayShiftRule.findMany({ where: { collectionId: scope.collectionId, active: true }, orderBy: { careType: 'asc' } }),
  ])
  return { quietDays, rules, timezone: normalizeTimeZone(scope.timezone) }
}
export async function loadCareForecast(db: PrismaClient | Prisma.TransactionClient, scope: ForecastScope) {
  const config = await forecastConfiguration(db, scope)
  const locations = await db.location.findMany({ where: { collectionId: scope.collectionId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  const items = await getCareQueue(db, { ...scope, timezone: config.timezone })
  return { timezone: config.timezone, days: careForecast(items, config, scope.now), quietDays: config.quietDays.filter(day => day.active), allQuietDays: config.quietDays, locations }
}
export function proposedQuietDays(config: CalendarConfig, draft: QuietDraft, collectionId: string): QuietDate[] {
  const days = [...config.quietDays]
  if (!draft || !['set', 'remove', 'create', 'weekly', 'rule'].includes(draft.kind)) throw new Error('Invalid Quiet Day change.')
  if (draft.kind === 'rule') return days
  if (draft.kind === 'weekly') {
    if (!Array.isArray(draft.weekdays) || draft.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Choose valid weekdays.')
    const localWeekly = days.filter(day => day.active && day.quietType === 'WEEKLY_RECURRING' && (day.locationId || null) === (draft.locationId || null))
    const remaining = days.filter(day => !localWeekly.includes(day) || draft.weekdays.includes(day.dayOfWeek!))
    return [...remaining, ...[...new Set(draft.weekdays)].filter(weekday => !localWeekly.some(day => day.dayOfWeek === weekday)).map(dayOfWeek => ({ id: `forecast-${scheduleDigest([collectionId, draft.locationId || null, dayOfWeek]).slice(0, 32)}`, locationId: draft.locationId || null, name: `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]} Quiet Day`, quietType: 'WEEKLY_RECURRING', date: null, startDate: null, endDate: null, dayOfWeek, active: true }))]
  }
  if (draft.kind === 'create' && draft.id && !days.some(day => day.id === draft.id)) throw new Error('Quiet Day no longer exists.')
  if (draft.kind === 'remove') {
    if (!days.some(day => day.id === draft.id)) throw new Error('Quiet Day no longer exists.')
    return days.filter(day => day.id !== draft.id)
  }
  if (draft.kind === 'set' && draft.moveId) {
    const old = days.find(day => day.id === draft.moveId)
    if (!old || old.quietType !== 'ONE_TIME') throw new Error('Only a one-time Quiet Day can be moved here. Edit recurring rules in settings.')
  }
  const quietType = draft.kind === 'set' ? 'ONE_TIME' : draft.quietType
  if (!['ONE_TIME', 'WEEKLY_RECURRING', 'DATE_RANGE'].includes(quietType)) throw new Error('Invalid Quiet Day rule.')
  const parse = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid calendar date.')
    const date = parseDateLocal(value, config.timezone)!
    if (dateInputValue(date, config.timezone) !== value) throw new Error('Invalid calendar date.')
    return date
  }
  const day: QuietDate = { locationId: draft.kind === 'create' ? draft.locationId || null : days.find(day => day.id === draft.moveId)?.locationId || null, id: draft.kind === 'create' && draft.id || draft.kind === 'set' && draft.moveId || `forecast-${scheduleDigest([collectionId, draft]).slice(0, 32)}`, name: draft.kind === 'create' ? draft.name?.slice(0, 100) || 'Quiet day' : 'Quiet day', quietType, date: null, startDate: null, endDate: null, dayOfWeek: null, active: draft.kind === 'create' ? draft.active !== false : true, description: draft.kind === 'create' ? draft.description?.slice(0, 2000) || null : null }
  if (quietType === 'ONE_TIME') day.date = parse(draft.date)
  if (quietType === 'DATE_RANGE' && draft.kind === 'create') {
    day.startDate = parse(draft.startDate); day.endDate = parse(draft.endDate)
    if (day.endDate < day.startDate) throw new Error('End date must follow the start date.')
  }
  if (quietType === 'WEEKLY_RECURRING' && draft.kind === 'create') {
    if (!Number.isInteger(draft.dayOfWeek) || draft.dayOfWeek! < 0 || draft.dayOfWeek! > 6) throw new Error('Choose a weekday.')
    day.dayOfWeek = draft.dayOfWeek!
  }
  return [...days.filter(old => old.id !== day.id), day]
}
export async function previewQuietChange(db: PrismaClient | Prisma.TransactionClient, scope: ForecastScope, draft: QuietDraft) {
  const now = scope.now || new Date()
  const config = await forecastConfiguration(db, scope)
  if ((draft?.kind === 'create' || draft?.kind === 'weekly') && draft.locationId !== undefined && draft.locationId !== null && typeof draft.locationId !== 'string') throw new Error('Invalid location scope.')
  if ((draft?.kind === 'create' || draft?.kind === 'weekly') && draft.locationId) {
    if (typeof draft.locationId !== 'string' || !await db.location.findFirst({ where: { id: draft.locationId, collectionId: scope.collectionId } })) throw new Error('Location does not belong to this collection.')
  }
  const quietDays = proposedQuietDays(config, draft, scope.collectionId)
  let rules = config.rules
  if (draft.kind === 'rule') {
    if (!schedulableCareTypes.includes(draft.careType as any) || !['EARLIER', 'LATER', 'SMART'].includes(draft.defaultShiftDirection) || ![draft.maxShiftDaysBefore, draft.maxShiftDaysAfter].every(value => Number.isInteger(value) && value >= 0 && value <= 14) || typeof draft.active !== 'boolean') throw new Error('Invalid Quiet Day shift rule.')
    rules = [...rules.filter(rule => rule.careType !== draft.careType), { careType: draft.careType, active: draft.active, defaultShiftDirection: draft.defaultShiftDirection, maxShiftDaysBefore: draft.maxShiftDaysBefore, maxShiftDaysAfter: draft.maxShiftDaysAfter }]
  }
  const before = await getCareQueue(db, { ...scope, timezone: config.timezone, persistQuietPlan: false })
  const after = await getCareQueue(db, { ...scope, timezone: config.timezone, quietDayOverride: quietDays, quietRuleOverride: rules, persistQuietPlan: false, reviseQuietPlan: true })
  const previous = new Map(before.map(item => [item.key, item]))
  const today = dateInputValue(now, config.timezone)
  const changes = after.filter(item => previous.get(item.key)?.dueAt.getTime() !== item.dueAt.getTime()).map(item => ({ key: item.key, taskType: item.taskType, title: item.title, locationId: item.locationId, locationName: item.locationName, originalDate: dateInputValue(item.originalDueAt || previous.get(item.key)!.dueAt, config.timezone), from: dateInputValue(previous.get(item.key)!.dueAt, config.timezone), to: dateInputValue(item.dueAt, config.timezone), reason: item.quietDayReason || 'Original calendar date restored.' }))
  const changedLocation = draft.kind === 'weekly' || draft.kind === 'create' ? draft.locationId : draft.kind === 'remove' ? config.quietDays.find(rule => rule.id === draft.id)?.locationId : draft.kind === 'set' && draft.moveId ? config.quietDays.find(rule => rule.id === draft.moveId)?.locationId : null
  const inChangedScope = (item: { locationId?: string | null }) => !changedLocation || item.locationId === changedLocation
  const exceptions = after.filter(inChangedScope).filter(item => /exception|required on quiet|overdue care/i.test(item.quietDayReason || '')).map(item => ({ key: item.key, title: item.title, taskType: item.taskType, locationName: item.locationName, date: dateInputValue(item.dueAt, config.timezone), reason: item.quietDayReason }))
  // Inspect long closures even outside the seven-day display, without expanding ranges.
  const careRisks = after.filter(inChangedScope).filter(item => !item.completedAt && item.cadenceDays && quietDays.some(rule => {
    if (!rule.active || rule.quietType !== 'DATE_RANGE' || !rule.startDate || !rule.endDate || rule.endDate < now || rule.locationId && rule.locationId !== item.locationId) return false
    return calendarDayIndexInTimeZone(rule.endDate, config.timezone) - calendarDayIndexInTimeZone(rule.startDate, config.timezone) + 1 > item.cadenceDays!
  })).map(item => ({ key: item.key, title: item.title, taskType: item.taskType, locationName: item.locationName, date: dateInputValue(item.dueAt, config.timezone), reason: 'Extended care interruption: this closure exceeds the assessment cadence. Arrange necessary care; future assessments may be required during the closure.' }))
  const days = careForecast(after, { ...config, quietDays, rules }, now)
  const hash = scheduleDigest({ config, draft, today, before: before.map(item => [item.key, item.scheduleAnchor, item.dueAt, item.manualSchedule, item.locationId]).sort(), after: after.map(item => [item.key, item.dueAt, item.locationId, item.quietDayReason]).sort(), days: days.map(day => [day.date, day.total]) })
  const tomorrowDate = addCalendarDays(now, 1, config.timezone)
  const tomorrow = changes.some(change => change.to <= today && change.from === dateInputValue(tomorrowDate, config.timezone)) || Boolean(isQuietDate(tomorrowDate, quietDays, config.timezone)) && (!isQuietDate(tomorrowDate, config.quietDays, config.timezone) || changes.some(change => change.from === dateInputValue(tomorrowDate, config.timezone)))
  return { hash, draft, changes, exceptions, careRisks, days, quietDays, rules, earlier: changes.filter(change => change.to < change.from).length, later: changes.filter(change => change.to > change.from).length, todayCount: changes.filter(change => change.to <= today).length, wateringToday: changes.filter(change => change.to <= today && change.taskType === 'WATER').length, tomorrow, timezone: config.timezone }
}
