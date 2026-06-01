export const FALLBACK_TIMEZONE = 'America/New_York'

type DateInput = Date | string | null | undefined

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string) {
  const cached = partFormatters.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  partFormatters.set(timeZone, formatter)
  return formatter
}

export function normalizeTimeZone(timeZone?: string | null) {
  const candidate = timeZone || process.env.AXILDB_DEFAULT_TIMEZONE || FALLBACK_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return FALLBACK_TIMEZONE
  }
}

export function defaultTimeZone() {
  return normalizeTimeZone()
}

export function timeZoneForPreference(preference?: { timezone?: string | null } | null) {
  return normalizeTimeZone(preference?.timezone)
}

function zonedParts(date: Date, timeZone = defaultTimeZone()): ZonedParts {
  const values: Partial<Record<keyof ZonedParts, number>> = {}
  const keys = new Set(['year', 'month', 'day', 'hour', 'minute', 'second'])
  for (const part of partsFormatter(normalizeTimeZone(timeZone)).formatToParts(date)) {
    if (keys.has(part.type)) values[part.type as keyof ZonedParts] = Number(part.value)
  }
  return {
    year: values.year || 1970,
    month: values.month || 1,
    day: values.day || 1,
    hour: values.hour || 0,
    minute: values.minute || 0,
    second: values.second || 0,
  }
}

function timeZoneOffsetMs(date: Date, timeZone = defaultTimeZone()) {
  const parts = zonedParts(date, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - date.getTime()
}

function zonedDateTimeToUtc(parts: ZonedParts, timeZone = defaultTimeZone()) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  let result = new Date(utcGuess - timeZoneOffsetMs(new Date(utcGuess), timeZone))
  result = new Date(utcGuess - timeZoneOffsetMs(result, timeZone))
  return result
}

export function parseDateTimeLocal(value?: string | null, timeZone = defaultTimeZone()) {
  if (!value) return undefined
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }
  const [, year, month, day, hour, minute, second] = match
  return zonedDateTimeToUtc({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second || 0),
  }, timeZone)
}

export function parseDateLocal(value?: string | null, timeZone = defaultTimeZone()) {
  if (!value) return undefined
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return parseDateTimeLocal(value, timeZone)
  const [, year, month, day] = match
  return zonedDateTimeToUtc({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: 0,
    minute: 0,
    second: 0,
  }, timeZone)
}

export function startOfDayInTimeZone(date: DateInput = new Date(), timeZone = defaultTimeZone()) {
  const parts = zonedParts(new Date(date || Date.now()), timeZone)
  return zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone)
}

export function endOfDayInTimeZone(date: DateInput = new Date(), timeZone = defaultTimeZone()) {
  return new Date(addCalendarDays(startOfDayInTimeZone(date, timeZone), 1, timeZone).getTime() - 1)
}

export function calendarDayIndexInTimeZone(date: DateInput = new Date(), timeZone = defaultTimeZone()) {
  const parts = zonedParts(new Date(date || Date.now()), timeZone)
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / (24 * 60 * 60 * 1000))
}

export function addCalendarDays(date: Date, days: number, timeZone = defaultTimeZone()) {
  const parts = zonedParts(date, timeZone)
  const local = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second))
  return zonedDateTimeToUtc({
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  }, timeZone)
}

export function addCalendarMonths(date: Date, months: number, timeZone = defaultTimeZone()) {
  const parts = zonedParts(date, timeZone)
  const local = new Date(Date.UTC(parts.year, parts.month - 1 + months, parts.day, parts.hour, parts.minute, parts.second))
  return zonedDateTimeToUtc({
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  }, timeZone)
}

export function addCalendarYears(date: Date, years: number, timeZone = defaultTimeZone()) {
  return addCalendarMonths(date, years * 12, timeZone)
}

export function formatDate(value: DateInput, timeZone = defaultTimeZone(), options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    timeZone: normalizeTimeZone(timeZone),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(date)
}

export function formatDateTime(value: DateInput, timeZone = defaultTimeZone(), options: Intl.DateTimeFormatOptions = {}) {
  return formatDate(value, timeZone, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...options,
  })
}

export function dateInputValue(value: DateInput, timeZone = defaultTimeZone()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = zonedParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}
