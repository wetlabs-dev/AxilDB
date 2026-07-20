export const plantTagCategories = [
  'APPEARANCE', 'LEAF_TEXTURE', 'LEAF_PATTERN', 'COLOR_EFFECT', 'GROWTH_HABIT',
  'PLANT_BEHAVIOR', 'PLANT_FORM', 'CARE_TRAIT', 'ENVIRONMENT', 'PET_SAFETY',
  'COLLECTION_THEME', 'OTHER',
] as const

export const plantTagIcons = ['tag', 'sparkles', 'moon', 'feather', 'palette', 'shapes', 'sprout', 'leaf', 'shield-check', 'sun', 'droplets'] as const
export const plantTagColors = ['fern', 'moss', 'sage', 'amber', 'rose', 'sky', 'violet', 'stone'] as const

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
