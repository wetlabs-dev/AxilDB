'use client'
import { Camera, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'
import { PlantImage, type PlantImageFrame } from '@/components/PlantImage'
import { PlantPhotoUploadForm, type PhotoUploadResult } from '@/components/PlantPhotoUploadForm'
import type { CareQueueItem } from '@/lib/care-queue'

type ExistingPhoto = PlantImageFrame & { id: string; caption?: string | null; isCover: boolean }
type PhotoState = { photos: ExistingPhoto[]; canSetRepresentative: boolean }
export function CareQueuePhoto({ item, collectionSlug, canUpload }: { item: CareQueueItem; collectionSlug: string; canUpload: boolean }) {
  const [image, setImage] = useState(item.image), [open, setOpen] = useState(false), [message, setMessage] = useState('')
  const [state, setState] = useState<PhotoState | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId(), plantId = item.plantInstanceId
  useEffect(() => setImage(item.image), [item.image])
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ collectionSlug: string; plantInstanceId: string; image: PlantImageFrame | null }>).detail
      if (detail.collectionSlug === collectionSlug && detail.plantInstanceId === plantId) setImage(detail.image || undefined)
    }
    window.addEventListener('axildb:plant-photo', update)
    return () => window.removeEventListener('axildb:plant-photo', update)
  }, [collectionSlug, plantId])
  useEffect(() => {
    if (!open) return
    const element = dialog.current, origin = trigger.current, controller = new AbortController(), overflow = document.body.style.overflow
    element?.showModal(); document.body.style.overflow = 'hidden'
    setState(null); setError('')
    void fetch(`/api/photos?collectionSlug=${encodeURIComponent(collectionSlug)}&plantInstanceId=${encodeURIComponent(plantId!)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!controller.signal.aborted) setState(result) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load plant photos.') })
    return () => { controller.abort(); element?.close(); document.body.style.overflow = overflow; if (origin?.isConnected) origin.focus({ preventScroll: true }) }
  }, [open, attempt, collectionSlug, plantId])
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer) }, [message])
  function saved(result: PhotoUploadResult, confirmation?: string) {
    window.dispatchEvent(new CustomEvent('axildb:plant-photo', { detail: { collectionSlug, plantInstanceId: plantId, image: result.image } }))
    setMessage(confirmation || (image?.path ? 'Progress photo added' : 'Plant photo added')); setOpen(false)
  }
  const progress = Boolean(image?.path)
  const heading = progress ? 'Add progress photo' : 'Add plant photo'
  return <div className="relative h-full w-full">
    <PlantImage src={image} alt={item.plantName || item.title} />
    {canUpload && plantId && <button ref={trigger} type="button" title={progress ? 'Add progress photo' : 'Add photo to this plant'} aria-label={`${progress ? 'Add progress photo' : 'Add photo'} to ${item.plantId || item.plantName}`} onClick={() => { setState(null); setError(''); setMessage(''); setOpen(true) }} className={`absolute z-10 flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-[#9caf91] bg-[#fffdf7]/90 px-2 text-xs font-semibold text-[#2f6b45] shadow-sm hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6b45] ${progress ? 'bottom-1 right-1' : 'bottom-1 right-1 md:bottom-0 md:right-0'}`}>
      <Camera className="h-4 w-4" aria-hidden="true" />{!progress && <span className="md:sr-only">Add photo</span>}
    </button>}
    <span role="status" className={message ? "pointer-events-none absolute inset-x-0 top-0 bg-[#fffdf7]/95 p-1 text-center text-[10px] font-semibold text-[#2f6b45]" : "sr-only"}>{message}</span>
    {open && createPortal(<dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) setOpen(false) }} className="m-auto max-h-[92dvh] w-[min(38rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-[#c7d8bd] bg-[#fffdf7] p-4 text-stone-800 shadow-xl backdrop:bg-black/40 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id={titleId} className="font-serif text-xl font-bold">{heading}</h2><p className="mt-1 text-sm">{item.plantName} · {item.plantId}</p>{item.locationPath && <p className="text-xs text-stone-500">{item.locationPath}</p>}</div>
        <button type="button" aria-label="Close photo dialog" disabled={busy} onClick={() => setOpen(false)} className="flex min-h-11 min-w-11 items-center justify-center rounded border border-stone-300"><X className="h-5 w-5" /></button>
      </div>
      {progress && <p className="my-3 text-sm text-stone-600">Document this plant’s current appearance. Your existing photos will be preserved.</p>}
      <p className="my-3 text-xs text-stone-600">This photo stays with the plant. It will not be linked to or complete this care activity.</p>
      {!state && !error && <p role="status">Loading photo options…</p>}
      {error && <div role="alert" className="my-3 text-sm text-red-800">{error} <button type="button" onClick={() => setAttempt(value => value + 1)} className="underline">Retry</button></div>}
      {state && <>
        {state.canSetRepresentative && state.photos.length > 0 && <details className="my-3 rounded border border-stone-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Choose an existing representative photo</summary>
          <div className="mt-3 grid grid-cols-3 gap-2">{state.photos.map(photo => <button disabled={busy} type="button" key={photo.id} aria-label={`Use ${photo.caption || 'existing photo'} as representative`} onClick={async () => {
            if (busy) return
            setBusy(true); setError('')
            try {
              const response = await fetch('/api/photos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionSlug, photoId: photo.id }) })
              const result = await response.json(); if (!response.ok) throw new Error(result.error)
              saved(result, 'Representative photo updated')
            } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not select photo.') }
            finally { setBusy(false) }
          }} className="aspect-square overflow-hidden rounded border border-[#c7d8bd] focus-visible:ring-2 focus-visible:ring-[#2f6b45]"><PlantImage src={photo} alt={photo.caption || 'Existing plant photo'} /></button>)}</div>
          <a href={`/c/${encodeURIComponent(collectionSlug)}/instances/${plantId}#photos`} className="mt-2 block text-xs underline">View full photo gallery</a>
        </details>}
        <PlantPhotoUploadForm collectionSlug={collectionSlug} plantInstanceId={plantId!} back={`/c/${encodeURIComponent(collectionSlug)}/instances/${plantId}`} canSetRepresentative={state.canSetRepresentative} onSaved={saved} onCancel={() => setOpen(false)} onBusy={setBusy} />
      </>}
    </dialog>, document.body)}
  </div>
}
