import { prisma } from '@/lib/prisma'

export type SortOption = {
  value: string
  label: string
}

export async function sortPreference(userId: string | undefined, section: string, fallback: string, allowed: readonly string[]) {
  if (!userId) return fallback
  const preference = await prisma.userSortPreference.findUnique({
    where: { userId_section: { userId, section } },
    select: { sortKey: true },
  })
  return preference && allowed.includes(preference.sortKey) ? preference.sortKey : fallback
}

export function selectedSortLabel(options: readonly SortOption[], value: string) {
  return options.find((option) => option.value === value)?.label || options[0]?.label || 'Default'
}

export function compareText(left: string | null | undefined, right: string | null | undefined) {
  return (left || '').localeCompare(right || '', undefined, { numeric: true, sensitivity: 'base' })
}

export function timeValue(value: Date | string | null | undefined) {
  return value ? new Date(value).getTime() : 0
}
