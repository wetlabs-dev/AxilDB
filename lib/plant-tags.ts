export const plantTagCategories = [
  'APPEARANCE', 'LEAF_TEXTURE', 'LEAF_PATTERN', 'COLOR_EFFECT', 'GROWTH_HABIT',
  'PLANT_BEHAVIOR', 'PLANT_FORM', 'CARE_TRAIT', 'ENVIRONMENT', 'PET_SAFETY',
  'COLLECTION_THEME', 'OTHER',
] as const

export const plantTagIcons = [
  'tag', 'sparkles', 'gem', 'moon', 'sun', 'cloud-sun', 'snowflake', 'flame',
  'droplets', 'waves', 'wind', 'thermometer', 'mountain', 'house',
  'feather', 'palette', 'shapes', 'circle-dot', 'eye', 'heart',
  'sprout', 'leaf', 'flower-2', 'bug', 'paw-print',
  'shield-check', 'shield-alert', 'triangle-alert',
] as const

export const plantTagColors = ['fern', 'sage', 'amber', 'coral', 'rose', 'sky', 'ocean', 'violet', 'stone'] as const
export const acceptedPlantTagColors = [...plantTagColors, 'moss'] as const

export function normalizePlantTagName(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60)
}

export function plantTagSlug(value: unknown) {
  return normalizePlantTagName(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)
}

export function parseTagIds(fd: FormData) {
  return Array.from(new Set(fd.getAll('plantTagIds').map(String).filter(Boolean)))
}

export function tagCategoryLabel(value?: string | null) {
  return value ? value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()) : 'Other'
}

export class TagReviewError extends Error {}

export type PlantTagConfiguration = { name: string; category: string; icon: string; colorToken: string; description: string; publicVisible: boolean }
/** AI cosmetics get safe defaults; approval rejects unsupported explicit configuration. */
export function plantTagConfiguration(raw: Record<string, unknown>, strict = false): PlantTagConfiguration {
  function option(value: unknown, options: readonly string[], fallback: string) {
    if (value == null || value === '') return fallback
    if (typeof value === 'string' && options.includes(value)) return value
    if (strict) throw new TagReviewError('Unsupported tag category, icon or color. Review the tag configuration.')
    return fallback
  }
  if (strict && raw.publicVisible != null && typeof raw.publicVisible !== 'boolean') throw new TagReviewError('Choose Public or Private for this tag.')
  return { name: normalizePlantTagName(raw.name), category: option(raw.category, plantTagCategories, 'OTHER'), icon: option(raw.icon, plantTagIcons, 'tag'), colorToken: option(raw.colorToken, acceptedPlantTagColors, 'fern'), description: String(raw.description || '').trim().slice(0, 500), publicVisible: typeof raw.publicVisible === 'boolean' ? raw.publicVisible : true }
}
