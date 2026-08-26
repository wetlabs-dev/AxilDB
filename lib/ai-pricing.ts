export type AiModelPricing = {
  inputPerMillion: number
  outputPerMillion: number
}

export const AI_MODEL_PRICING: Record<string, AiModelPricing> = {
  'gpt-5.4-mini': { inputPerMillion: 0.25, outputPerMillion: 2.00 },
  'gpt-5.4': { inputPerMillion: 1.25, outputPerMillion: 10.00 },
  'gpt-5.5': { inputPerMillion: 2.00, outputPerMillion: 16.00 },
  'gpt-5.6-luna': { inputPerMillion: 0.25, outputPerMillion: 2.00 },
  'gpt-5.6-terra': { inputPerMillion: 1.25, outputPerMillion: 10.00 },
  'gpt-5.6-sol': { inputPerMillion: 2.00, outputPerMillion: 16.00 },
}

export const DEFAULT_AI_MODEL_PRICING: AiModelPricing = { inputPerMillion: 1.25, outputPerMillion: 10.00 }

export function aiModelPricing(model?: string | null) {
  return model ? AI_MODEL_PRICING[model] || DEFAULT_AI_MODEL_PRICING : DEFAULT_AI_MODEL_PRICING
}

export function estimateAiCostDollars(inputTokens: number, outputTokens: number, model?: string | null) {
  const pricing = aiModelPricing(model)
  return (Math.max(0, inputTokens) / 1_000_000) * pricing.inputPerMillion
    + (Math.max(0, outputTokens) / 1_000_000) * pricing.outputPerMillion
}

export function tokenUsageCostDollars(usage: { inputTokens?: number | null; outputTokens?: number | null }, model?: string | null) {
  return estimateAiCostDollars(usage.inputTokens || 0, usage.outputTokens || 0, model)
}
