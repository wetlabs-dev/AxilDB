export const curatorResponseFormat = {
  format: { type: 'json_object' },
} as const
export class CuratorResponseError extends Error {
  constructor(
    public kind:
      'OUTPUT_LIMIT' | 'REFUSAL' | 'INCOMPLETE' | 'EMPTY' | 'INVALID_JSON',
    message: string
  ) {
    super(message)
    this.name = 'CuratorResponseError'
  }
}
export function isCuratorResponseFailure(message: string | null | undefined) {
  return Boolean(
    message &&
    (/AI Curator response (?:did not contain JSON|reached the configured output limit|was incomplete|contained no usable text|was not a valid JSON object|was missing suggestedValue)/i.test(
      message
    ) ||
      /(?:Expected|Unexpected|Unterminated|Bad control character|Bad escaped character)[\s\S]*\bJSON\b/i.test(
        message
      ))
  )
}
export function parseCuratorResponse(
  payload: any,
  maxTokens: number
): Record<string, any> {
  const items = Array.isArray(payload?.output) ? payload.output : []
  const content = items.flatMap((item: any) =>
    Array.isArray(item?.content) ? item.content : []
  )
  if (content.some((part: any) => part?.type === 'refusal'))
    throw new CuratorResponseError(
      'REFUSAL',
      'AI Curator declined this request. Review the request and available evidence; automatic retries are paused.'
    )
  if (
    payload?.status === 'incomplete' ||
    items.some((item: any) => item?.status === 'incomplete')
  ) {
    if (payload?.incomplete_details?.reason === 'max_output_tokens')
      throw new CuratorResponseError(
        'OUTPUT_LIMIT',
        `AI Curator response reached the configured output limit (${maxTokens} tokens). No partial result was saved. Increase Curator Max tokens before retrying.`
      )
    throw new CuratorResponseError(
      'INCOMPLETE',
      'AI Curator response was incomplete. No partial result was saved.'
    )
  }
  if (payload?.status && payload.status !== 'completed')
    throw new CuratorResponseError(
      'INCOMPLETE',
      'AI Curator response was incomplete. No result was saved.'
    )
  const text =
    typeof payload?.output_text === 'string' && payload.output_text.trim()
      ? payload.output_text
      : content
          .filter(
            (part: any) =>
              part?.type === 'output_text' && typeof part.text === 'string'
          )
          .map((part: any) => part.text)
          .join('\n')
  if (!text.trim())
    throw new CuratorResponseError(
      'EMPTY',
      'AI Curator response contained no usable text. No result was saved.'
    )
  // Whole fenced JSON is accepted for older compatible providers. Never extract/repair fragments.
  const body = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
  let result: any
  try {
    result = JSON.parse(body)
  } catch {
    throw new CuratorResponseError(
      'INVALID_JSON',
      'AI Curator response was not a valid JSON object. No partial result was saved.'
    )
  }
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new CuratorResponseError(
      'INVALID_JSON',
      'AI Curator response was not a valid JSON object. No result was saved.'
    )
  if (!Object.prototype.hasOwnProperty.call(result, 'suggestedValue'))
    throw new CuratorResponseError(
      'INVALID_JSON',
      'AI Curator response was missing suggestedValue. No result was saved.'
    )
  return result
}
