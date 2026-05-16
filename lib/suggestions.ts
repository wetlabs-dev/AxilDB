export function rankedSuggestions(values: Array<string | null | undefined>, limit = 40) {
  const counts = new Map<string, number>()

  for (const value of values) {
    const suggestion = value?.trim()
    if (!suggestion) continue
    counts.set(suggestion, (counts.get(suggestion) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort(([leftValue, leftCount], [rightValue, rightCount]) => {
      if (rightCount !== leftCount) return rightCount - leftCount
      return leftValue.localeCompare(rightValue)
    })
    .slice(0, limit)
    .map(([value]) => value)
}
