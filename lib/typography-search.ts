import { formatTypography, normalizeTypographySearch } from '@/lib/typography'

export function typographySearchVariants(value: string): string[] {
  const ascii = normalizeTypographySearch(value)
  return [...new Set([value, ascii, ascii.replaceAll("'", '’').replaceAll('"', '”'), formatTypography(ascii), ascii.replace(/(^|\s)x(?=\s|$)/gi,'$1×'), ascii.replace(/(\d)\s+(?=°?[CF]\b|mL\b|cm\b|lux\b)/g,'$1')])]
}

/** Expand only human-readable Prisma contains filters; literal IDs/URLs stay exact.
 * Bounded to six variants per field; no SQL extensions or database rewrites.
 */
export function typographySearchWhere<T extends object>(where: T): T {
  const literal = /(?:Id|Ids|Url|Code|Hash|Token|Key|Path)$|^(?:id|code|url|slug|email|website|plantId|stockNumber)$/i
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== 'object' || value instanceof Date) return value
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return value
    const result: Record<string, unknown> = {}, clauses: unknown[] = []
    for (const [key, child] of Object.entries(value)) {
      if (!literal.test(key) && child && typeof child === 'object' && 'contains' in child && typeof child.contains === 'string') {
        const variants = typographySearchVariants(child.contains)
        if (variants.length > 1) {
          clauses.push({ OR: variants.map(contains => ({ [key]: { ...child, contains } })) })
          continue
        }
      }
      result[key] = visit(child)
    }
    if (clauses.length) result.AND = [...(result.AND ? (Array.isArray(result.AND) ? result.AND : [result.AND]) : []), ...clauses]
    return result
  }
  return visit(where) as T
}
