import { labelFormatOptions, defaultLabelOrientation, type LabelFormat, type LabelOrientation } from './plant-labels'

export type LabelCategory = 'plants' | 'locations' | 'both'
export type LabelSort = 'plant-id' | 'added-newest' | 'added-oldest'
export type LabelCategorySettings = { format: LabelFormat; orientation: LabelOrientation; sort?: LabelSort }
export type LabelPdfPreferences = { version: 1; lastCategory: LabelCategory; categories: Record<LabelCategory, LabelCategorySettings> }
export const labelCategories: LabelCategory[] = ['plants', 'locations', 'both']
export const labelFormats = labelFormatOptions.map(option => option.value)
export const labelSorts: LabelSort[] = ['plant-id', 'added-newest', 'added-oldest']
export const labelPdfStorageKey = (userId?: string) => `axildb:plant-label-pdf-preferences:v1:${userId || 'guest'}`
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function normalizeLabelPreferences(value: unknown): LabelPdfPreferences {
  const input = object(value)
  const categories = input.version === 1 ? object(input.categories) : {}
  const settings = (category: LabelCategory): LabelCategorySettings => {
    const saved = object(categories[category])
    const format = labelFormats.includes(saved.format as LabelFormat) ? saved.format as LabelFormat : 'fixed'
    const orientation = saved.orientation === 'portrait' || saved.orientation === 'landscape' ? saved.orientation : defaultLabelOrientation(format)
    return { format, orientation, ...(category === 'locations' ? {} : { sort: labelSorts.includes(saved.sort as LabelSort) ? saved.sort as LabelSort : 'plant-id' }) }
  }
  return {
    version: 1,
    lastCategory: input.version === 1 && labelCategories.includes(input.lastCategory as LabelCategory) ? input.lastCategory as LabelCategory : 'plants',
    categories: { plants: settings('plants'), locations: settings('locations'), both: settings('both') },
  }
}
export function readLabelPreferences(storage: Pick<Storage, 'getItem'>, key: string) {
  try { return normalizeLabelPreferences(JSON.parse(storage.getItem(key) || 'null')) } catch { return normalizeLabelPreferences(null) }
}
/** Read/merge only the changed category so an older tab preserves other category settings. */
export function saveLabelPreferences(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, category: LabelCategory, patch: Partial<LabelCategorySettings>) {
  const next = readLabelPreferences(storage, key)
  next.lastCategory = category
  next.categories[category] = { ...next.categories[category], ...patch }
  const valid = normalizeLabelPreferences(next)
  storage.setItem(key, JSON.stringify(valid))
  return valid
}
