'use client'
import { useEffect, useRef, useState } from 'react'
import { PhotoFramingEditor } from '@/components/PhotoFramingEditor'
import { MAX_PHOTO_BYTES, SUPPORTED_PHOTO_TYPES } from '@/lib/photo-upload'
import type { PlantImageFrame } from '@/components/PlantImage'

export type PhotoUploadResult = { image: PlantImageFrame | null; photoId?: string }
export function PlantPhotoUploadForm({ collectionSlug, plantInstanceId, back, canSetRepresentative = false, onSaved, onCancel, onBusy }: {
  collectionSlug: string; plantInstanceId: string; back: string; canSetRepresentative?: boolean
  onSaved?: (result: PhotoUploadResult) => void; onCancel?: () => void; onBusy?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const sending = useRef(false), uploadId = useRef<string | null>(null), formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const form = formRef.current
    const activeFileOnly = (event: FormDataEvent) => {
      event.formData.delete(event.formData.get('photoChoice') === 'photoCapture' ? 'photo' : 'photoCapture')
    }
    form?.addEventListener('formdata', activeFileOnly)
    return () => form?.removeEventListener('formdata', activeFileOnly)
  }, [])
  return <form ref={formRef} action="/api/photos" method="post" encType="multipart/form-data" className="grid min-w-0 gap-3" onSubmit={onSaved ? async event => {
    event.preventDefault()
    if (sending.current) return
    const form = event.currentTarget, data = new FormData(form)
    const choice = data.get('photoChoice') === 'photoCapture' ? 'photoCapture' : 'photo'
    const file = data.get(choice) as File | null
    if (!file?.size) { setError('Choose a photo first.'); return }
    if (file.size > MAX_PHOTO_BYTES || file.type && !SUPPORTED_PHOTO_TYPES.has(file.type)) { setError('Choose a JPEG, PNG, WebP, GIF, TIFF or AVIF image up to 25 MB.'); return }
    sending.current = true; setBusy(true); onBusy?.(true); setError('')
    uploadId.current ||= crypto.randomUUID()
    data.set('clientUploadId', uploadId.current)
    try {
      // Reconcile a previous ambiguous result before submitting the same durable identity.
      const check = await fetch(`/api/photos?collectionSlug=${encodeURIComponent(collectionSlug)}&plantInstanceId=${encodeURIComponent(plantInstanceId)}&uploadId=${uploadId.current}`, { cache: 'no-store' })
      if (!check.ok) throw new Error('Could not check photo state. Your selection has been kept; try again.')
      const existing = await check.json()
      if (existing.committed) { onSaved({ image: existing.image }); return }
      const response = await fetch('/api/photos', { method: 'POST', headers: { Accept: 'application/json' }, body: data, redirect: 'error' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Photo upload failed. Try again.')
      onSaved(result)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not confirm the upload. Your selection has been kept; try again.') }
    finally { sending.current = false; setBusy(false); onBusy?.(false) }
  } : undefined}>
    <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
    <input type="hidden" name="entityId" value={plantInstanceId} />
    <input type="hidden" name="collectionSlug" value={collectionSlug} />
    <input type="hidden" name="back" value={back} />
    <fieldset disabled={busy} className="grid min-w-0 gap-3">
      <PhotoFramingEditor fileInputName="photo" cameraCapture />
      <label className="grid gap-1 text-sm">Photo note (optional)<textarea name="caption" maxLength={4000} className="rounded border border-stone-300 p-2" /></label>
      <label className="grid gap-1 text-sm">Source (optional)<input name="source" maxLength={500} className="rounded border border-stone-300 p-2" /></label>
      <label className="grid gap-1 text-sm">Source URL (optional)<input type="url" name="sourceUrl" maxLength={2000} className="rounded border border-stone-300 p-2" /></label>
      {canSetRepresentative && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="setRepresentative" />Set as representative photo</label>}
    </fieldset>
    <p className="text-xs text-stone-600">Photos are saved in this plant’s gallery and history using the upload date. Adding a photo does not record care.</p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="sticky bottom-0 flex gap-2 bg-[#fffdf7] py-2 pb-[max(.5rem,env(safe-area-inset-bottom))]">
      <button disabled={busy} className="min-h-11 rounded bg-[#2f6b45] px-4 py-2 font-semibold text-white disabled:opacity-60">{busy ? 'Saving photo…' : 'Save photo'}</button>
      {onCancel && <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded border border-stone-300 px-4 py-2">Cancel</button>}
    </div>
    <span role="status" className="sr-only">{busy ? 'Uploading and processing photo' : ''}</span>
  </form>
}
