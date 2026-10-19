import {
  dateInputValue,
  parseDateLocal,
  endOfDayInTimeZone,
  defaultTimeZone,
} from '@/lib/time'

export type AnnualWindow = {
  id: string
  name: string
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  isActive: boolean
}
export function validateAnnualWindow(
  w: Pick<AnnualWindow, 'startMonth' | 'startDay' | 'endMonth' | 'endDay'>
) {
  for (const [month, day] of [
    [w.startMonth, w.startDay],
    [w.endMonth, w.endDay],
  ]) {
    if (
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > new Date(Date.UTC(2000, month, 0)).getUTCDate()
    )
      throw new Error(
        'Choose valid month/day boundaries (February 29 is allowed).'
      )
  }
}
function date(year: number, month: number, day: number, tz: string) {
  const clamped = Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate())
  return parseDateLocal(
    `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`,
    tz
  )!
}
export function windowOccurrence(
  w: AnnualWindow,
  year: number,
  timezone = defaultTimeZone()
) {
  validateAnnualWindow(w)
  if (!Number.isInteger(year) || year < 2000 || year > 2200)
    throw new Error('Choose a year from 2000 to 2200.')
  const cross = w.endMonth * 100 + w.endDay < w.startMonth * 100 + w.startDay
  return {
    windowId: w.id,
    year,
    startDate: date(year, w.startMonth, w.startDay, timezone),
    endDate: endOfDayInTimeZone(
      date(year + (cross ? 1 : 0), w.endMonth, w.endDay, timezone),
      timezone
    ),
  }
}
export function nextWindowOccurrence(
  w: AnnualWindow | null,
  referenceDate: Date,
  timezone = defaultTimeZone()
) {
  if (!w?.isActive) return null
  const year = Number(dateInputValue(referenceDate, timezone).slice(0, 4))
  for (let y = year - 1; y <= year + 1; y++) {
    const o = windowOccurrence(w, y, timezone)
    if (o.endDate >= referenceDate) return o
  }
  return null
}
export function selectRepottingWindow(input: {
  primaryWindow: AnnualWindow | null
  alternateWindow: AnnualWindow | null
  referenceDate: Date
  timezone: string
}) {
  const { referenceDate, timezone } = input
  const primary = nextWindowOccurrence(
      input.primaryWindow,
      referenceDate,
      timezone
    ),
    alternate = nextWindowOccurrence(
      input.alternateWindow,
      referenceDate,
      timezone
    )
  if (!primary)
    return alternate
      ? { ...alternate, selectionReason: 'ALTERNATE_NEXT' as const }
      : null
  if (
    !alternate ||
    primary.startDate <= referenceDate ||
    primary.startDate <= alternate.startDate
  )
    return { ...primary, selectionReason: 'PRIMARY_NEXT' as const }
  const [y, m, d] = dateInputValue(alternate.startDate, timezone)
    .split('-')
    .map(Number)
  const monthIndex = m - 1 + 3,
    year = y + Math.floor(monthIndex / 12),
    month = (monthIndex % 12) + 1
  const threshold = date(year, month, d, timezone)
  return primary.startDate <= threshold
    ? {
        ...primary,
        selectionReason: 'PRIMARY_PREFERRED_WITHIN_THRESHOLD' as const,
      }
    : { ...alternate, selectionReason: 'ALTERNATE_NEXT' as const }
}
export function windowRange(w: AnnualWindow) {
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return `${names[w.startMonth - 1]} ${w.startDay} – ${names[w.endMonth - 1]} ${w.endDay}`
}
export function windowFingerprint(w: AnnualWindow) {
  return [
    w.id,
    w.startMonth,
    w.startDay,
    w.endMonth,
    w.endDay,
    w.isActive,
  ].join(':')
}
