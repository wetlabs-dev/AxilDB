export type AiModelPricing = {
  inputPerMillion: number
  cachedInputPerMillion?: number
  outputPerMillion: number
}

export const AI_MODEL_PRICING: Record<string, AiModelPricing> = {
  'gpt-5.4-mini': { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.50 },
  'gpt-5.4': { inputPerMillion: 2.50, cachedInputPerMillion: 0.25, outputPerMillion: 15.00 },
  'gpt-5.5': { inputPerMillion: 5.00, cachedInputPerMillion: 0.50, outputPerMillion: 30.00 },
  'gpt-5.6-luna': { inputPerMillion: 0.20, cachedInputPerMillion: 0.02, outputPerMillion: 1.20 },
  'gpt-5.6-terra': { inputPerMillion: 2.00, cachedInputPerMillion: 0.20, outputPerMillion: 12.00 },
  'gpt-5.6-sol': { inputPerMillion: 4.00, cachedInputPerMillion: 0.40, outputPerMillion: 20.00 },
}

export const DEFAULT_AI_MODEL_PRICING: AiModelPricing = { inputPerMillion: 2.50, cachedInputPerMillion: 0.25, outputPerMillion: 15.00 }
export const WEB_SEARCH_CALL_DOLLARS = 10 / 1000
export const WEB_SEARCH_PREVIEW_REASONING_CALL_DOLLARS = 10 / 1000
export const WEB_SEARCH_PREVIEW_NON_REASONING_CALL_DOLLARS = 25 / 1000

export function aiModelPricing(model?: string | null) {
  return model ? AI_MODEL_PRICING[model] || DEFAULT_AI_MODEL_PRICING : DEFAULT_AI_MODEL_PRICING
}

export function isReasoningModel(model?: string | null) {
  const normalized = (model || '').toLowerCase()
  return normalized.startsWith('gpt-5') || /^o\d/.test(normalized)
}

export function estimateAiCostDollars(inputTokens: number, outputTokens: number, model?: string | null, cachedInputTokens = 0) {
  const pricing = aiModelPricing(model)
  const cached = Math.max(0, Math.min(inputTokens, cachedInputTokens))
  const uncached = Math.max(0, inputTokens - cached)
  return (uncached / 1_000_000) * pricing.inputPerMillion
    + (cached / 1_000_000) * (pricing.cachedInputPerMillion ?? pricing.inputPerMillion)
    + (Math.max(0, outputTokens) / 1_000_000) * pricing.outputPerMillion
}

export function webSearchToolCostDollars(input: {
  webSearchCalls?: number | null
  webSearchPreviewCalls?: number | null
}, model?: string | null) {
  const webSearchCost = Math.max(0, input.webSearchCalls || 0) * WEB_SEARCH_CALL_DOLLARS
  const previewRate = isReasoningModel(model)
    ? WEB_SEARCH_PREVIEW_REASONING_CALL_DOLLARS
    : WEB_SEARCH_PREVIEW_NON_REASONING_CALL_DOLLARS
  return webSearchCost + Math.max(0, input.webSearchPreviewCalls || 0) * previewRate
}

export function tokenUsageCostDollars(usage: {
  inputTokens?: number | null
  cachedInputTokens?: number | null
  outputTokens?: number | null
}, model?: string | null) {
  return estimateAiCostDollars(usage.inputTokens || 0, usage.outputTokens || 0, model, usage.cachedInputTokens || 0)
}

export function aiUsageCostDollars(usage: {
  inputTokens?: number | null
  cachedInputTokens?: number | null
  outputTokens?: number | null
  webSearchCalls?: number | null
  webSearchPreviewCalls?: number | null
}, model?: string | null) {
  if ((model || '').startsWith('omni-moderation') || (model || '').startsWith('text-moderation')) return 0
  return tokenUsageCostDollars(usage, model) + webSearchToolCostDollars(usage, model)
}
