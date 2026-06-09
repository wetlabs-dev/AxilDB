'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { toggleSunshine } from '@/app/actions'
import { isImageHiddenByModeration, ModeratedImagePlaceholder, PlantImage } from '@/components/PlantImage'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

const WELL_LOVED_THRESHOLD = 5
const sunshineCountLabel = (count: number) => `${count} sunshine`
const sunshineAnchor = (id: string) => `sunshine-photo-${id}`
const backToSunshine = (back: string, id: string) => `${back.split('#')[0] || '/'}#${sunshineAnchor(id)}`

export type GalleryPhoto = {
  id: string
  path: string
  moderationStatus?: string | null
  nsfwFlagged?: boolean | null
  caption: string
  createdAt: string
  kind: 'Specimen' | 'Bloom' | 'Type image'
  plantId: string
  plantName: string
  instanceHref: string
  bloomDate?: string | null
  isCover: boolean
  isType: boolean
  cropX?: number | null
  cropY?: number | null
  cropWidth?: number | null
  cropHeight?: number | null
  focalX?: number | null
  focalY?: number | null
  canSunshine: boolean
  sunshineCount: number
  sunshined: boolean
  canToggleSunshine: boolean
  collectionSlug: string
  back: string
}

export function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const activePhoto = activeIndex === null ? null : photos[activeIndex]

  const byPlant = useMemo(() => {
    return photos.reduce<Record<string, number>>((acc, photo) => {
      acc[photo.plantId] = (acc[photo.plantId] || 0) + 1
      return acc
    }, {})
  }, [photos])

  function move(direction: -1 | 1) {
    setActiveIndex((current) => {
      if (current === null) return null
      return (current + direction + photos.length) % photos.length
    })
  }

  useEffect(() => {
    if (activeIndex === null) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActiveIndex(null)
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeIndex, photos.length])

  if (photos.length === 0) {
    return (
      <div className="rounded-lg border border-stone-200/90 bg-[#fffaf0]/82 p-6 text-sm text-stone-600">
        No plant photos yet. Upload specimen or bloom photos and they will appear here.
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 text-xs text-stone-600">
        <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{photos.length} photos</span>
        <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1">{Object.keys(byPlant).length} records</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className="group min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-white/75 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#8fa58f] hover:shadow-md"
          >
            <button type="button" onClick={() => setActiveIndex(index)} className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-[#8fa58f]/40">
              <div className="aspect-square overflow-hidden bg-[#d6dfc9]/45">
                <PlantImage src={photo} alt={photo.caption || photo.plantId} className="transition duration-300 group-hover:scale-[1.04]" />
              </div>
            </button>
            <div className="grid gap-2 p-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={cn(
                  'rounded-full border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em]',
                  photo.kind === 'Bloom'
                    ? 'border-[#d9a394] bg-[#fff1ec] text-[#9a4b38]'
                    : 'border-[#b7c9ac] bg-[#eef5e8] text-[#2f6b45]',
                )}>
                  {photo.kind}
                </span>
                {photo.isCover && <span className="rounded-full border border-[#b7c9ac] bg-white px-2 py-0.5 text-[0.65rem] text-[#2f6b45]">Cover</span>}
                {photo.isType && <span className="rounded-full border border-[#b7c9ac] bg-white px-2 py-0.5 text-[0.65rem] text-[#2f6b45]">Type</span>}
              </div>
              <p className="truncate text-sm font-semibold text-stone-900">{photo.plantId}</p>
              <p className="line-clamp-2 text-xs text-stone-600">{photo.caption || photo.plantName}</p>
              {photo.canSunshine && (
                <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-stone-200 pt-2 text-xs">
                  {photo.sunshineCount >= WELL_LOVED_THRESHOLD && (
                    <span className="rounded-full border border-[#e4a950] bg-[#fff3d1] px-2 py-1 font-bold text-[#7a4b00]">☀️ Well Loved</span>
                  )}
                  {photo.canToggleSunshine ? (
                    <form id={sunshineAnchor(photo.id)} action={toggleSunshine}>
                      <input type="hidden" name="collectionSlug" value={photo.collectionSlug} />
                      <input type="hidden" name="targetType" value="PHOTO" />
                      <input type="hidden" name="targetId" value={photo.id} />
                      <input type="hidden" name="back" value={backToSunshine(photo.back, photo.id)} />
                      <Button
                        className={cn(
                          'sunshine-action-button px-2 py-1 text-xs',
                          photo.sunshined ? 'sunshine-action-button-active' : '',
                        )}
                      >
                        {photo.sunshined ? '☀️ Sunshined' : '☀️ Give Sunshine'} · {sunshineCountLabel(photo.sunshineCount)}
                      </Button>
                    </form>
                  ) : (
                    <span className="sunshine-action-button rounded-md px-2 py-1 text-xs font-medium">
                      ☀️ {sunshineCountLabel(photo.sunshineCount)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {activePhoto && (
        <div className="fixed inset-0 z-[80] bg-[#171b16]/95 text-white">
          <button
            type="button"
            aria-label="Close gallery"
            onClick={() => setActiveIndex(null)}
            className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>

          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => move(-1)}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => move(1)}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20"
          >
            <ChevronRight className="h-7 w-7" />
          </button>

          <div className="grid h-full grid-rows-[1fr_auto]">
            <div className="flex min-h-0 items-center justify-center p-4 sm:p-8">
              {isImageHiddenByModeration(activePhoto) ? (
                <ModeratedImagePlaceholder status={activePhoto.moderationStatus} className="max-h-full max-w-full rounded-lg border border-white/15 p-10 shadow-2xl" />
              ) : (
                <img src={activePhoto.path} alt={activePhoto.caption || activePhoto.plantId} className="max-h-full max-w-full object-contain shadow-2xl" />
              )}
            </div>
            <div className="border-t border-white/10 bg-black/35 p-4 backdrop-blur">
              <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">
                    {activeIndex! + 1} of {photos.length} · {activePhoto.kind}
                  </p>
                  <h3 className="mt-1 truncate font-serif text-xl font-semibold text-white">{activePhoto.plantId}</h3>
                  <p className="text-sm text-white/75">{activePhoto.plantName}</p>
                  {activePhoto.caption && <p className="mt-1 max-w-3xl text-sm text-white/85">{activePhoto.caption}</p>}
                </div>
                <Link href={activePhoto.instanceHref} className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20">
                  Open record
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
