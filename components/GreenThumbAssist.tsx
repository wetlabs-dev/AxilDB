'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Select, TextArea } from '@/components/ui'

type GreenThumbPhoto = {
  id: string
  caption: string | null
}

type GreenThumbAssistProps = {
  collectionSlug: string
  plantInstanceId: string
  photos: GreenThumbPhoto[]
  usedToday?: boolean
}

export function GreenThumbAssist({ collectionSlug, plantInstanceId, photos, usedToday = false }: GreenThumbAssistProps) {
  const router = useRouter()
  const [question, setQuestion] = useState('')
  const [photoId, setPhotoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState('')

  async function askGreenThumb() {
    const trimmedQuestion = question.trim()
    setError('')
    setAnswer('')

    if (!trimmedQuestion) {
      setError('Enter a plant care question first.')
      return
    }

    const confirmed = window.confirm(
      `Is this the question you want to ask about this plant today?\n\n"${trimmedQuestion}"\n\nYou'll be able to ask another question tomorrow.`,
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const response = await fetch('/api/ai/green-thumb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionSlug,
          plantInstanceId,
          question: trimmedQuestion,
          photoId: photoId || undefined,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Green Thumb assist failed.')
      }
      setAnswer(payload.answer || 'Green Thumb care note created.')
      setQuestion('')
      setPhotoId('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Green Thumb assist failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-[#bdd5b6] bg-[#eef8e9]/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-[#255537]">
            <Sparkles size={16} />
            Green Thumb assist
          </h4>
          <p className="mt-1 text-xs text-stone-700">
            Ask one focused care question per specimen per day. Photo context is optional and uses extra image input tokens.
          </p>
        </div>
        {usedToday && (
          <span className="rounded-full border border-[#bdd5b6] bg-white/70 px-3 py-1 text-xs font-semibold text-[#255537]">
            Used today
          </span>
        )}
      </div>

      {usedToday ? (
        <p className="mt-3 text-sm text-stone-700">Green Thumb can answer another question for this specimen tomorrow.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          <TextArea
            label="Care question"
            name="greenThumbQuestion"
            value={question}
            onChange={(event: any) => setQuestion(event.target.value)}
            placeholder="Example: How should I handle these yellowing leaves?"
            className="min-h-16"
          />
          {photos.length > 0 && (
            <Select
              label="Optional photo context"
              name="greenThumbPhotoId"
              value={photoId}
              onChange={(event: any) => setPhotoId(event.target.value)}
            >
              <option value="">No photo</option>
              {photos.map((photo) => (
                <option key={photo.id} value={photo.id}>
                  {photo.caption || 'Untitled specimen photo'}
                </option>
              ))}
            </Select>
          )}
          <Button type="button" onClick={askGreenThumb} disabled={loading}>
            {loading ? 'Asking Green Thumb...' : 'Ask Green Thumb'}
          </Button>
        </div>
      )}

      {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {answer && <p className="mt-3 rounded-md border border-[#bdd5b6] bg-white/70 px-3 py-2 text-sm text-[#255537]">{answer}</p>}
    </div>
  )
}
