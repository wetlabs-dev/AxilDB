'use client'

import { useEffect, useMemo, useState } from 'react'
import { Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlantImageFrame } from '@/components/PlantImage'

type PhotoFramingEditorProps = {
  src?: string | null
  initial?: PlantImageFrame | null
  fileInputName?: string
  fileInputClassName?: string
  className?: string
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function initialZoom(frame?: PlantImageFrame | null) {
  const cropWidth = frame?.cropWidth || 100
  const cropHeight = frame?.cropHeight || 100
  return Number(Math.max(1, Math.min(3, 100 / Math.max(25, Math.min(cropWidth, cropHeight)))).toFixed(2))
}

export function PhotoFramingEditor({
  src,
  initial,
  fileInputName,
  fileInputClassName = '',
  className = '',
}: PhotoFramingEditorProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [focalX, setFocalX] = useState(() => clamp(initial?.focalX ?? (initial?.cropX != null && initial?.cropWidth != null ? initial.cropX + initial.cropWidth / 2 : 50)))
  const [focalY, setFocalY] = useState(() => clamp(initial?.focalY ?? (initial?.cropY != null && initial?.cropHeight != null ? initial.cropY + initial.cropHeight / 2 : 50)))
  const [zoom, setZoom] = useState(() => initialZoom(initial))
  const imageSrc = previewUrl || src

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const crop = useMemo(() => {
    const cropWidth = clamp(100 / zoom, 25, 100)
    const cropHeight = clamp(100 / zoom, 25, 100)
    const cropX = clamp(focalX - cropWidth / 2, 0, 100 - cropWidth)
    const cropY = clamp(focalY - cropHeight / 2, 0, 100 - cropHeight)
    return { cropX, cropY, cropWidth, cropHeight }
  }, [focalX, focalY, zoom])

  return (
    <div className={cn('grid gap-3 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/70 p-3', className)}>
      {fileInputName && (
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          Image file
          <input
            name={fileInputName}
            type="file"
            accept="image/*"
            className={cn('min-w-0 rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm', fileInputClassName)}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (previewUrl) URL.revokeObjectURL(previewUrl)
              setPreviewUrl(file ? URL.createObjectURL(file) : null)
            }}
          />
        </label>
      )}

      <input type="hidden" name="cropX" value={crop.cropX.toFixed(3)} />
      <input type="hidden" name="cropY" value={crop.cropY.toFixed(3)} />
      <input type="hidden" name="cropWidth" value={crop.cropWidth.toFixed(3)} />
      <input type="hidden" name="cropHeight" value={crop.cropHeight.toFixed(3)} />
      <input type="hidden" name="focalX" value={focalX.toFixed(3)} />
      <input type="hidden" name="focalY" value={focalY.toFixed(3)} />

      <div className="grid gap-2 sm:grid-cols-[minmax(10rem,16rem)_1fr]">
        <button
          type="button"
          className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-[#d6dfc9]/45 text-[#2f6b45]"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            setFocalX(clamp(((event.clientX - rect.left) / rect.width) * 100))
            setFocalY(clamp(((event.clientY - rect.top) / rect.height) * 100))
          }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${focalX}% ${focalY}%`,
                transform: zoom > 1.01 ? `scale(${zoom})` : undefined,
                transformOrigin: `${focalX}% ${focalY}%`,
              }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-stone-600">Choose an image to preview framing</span>
          )}
          <span
            className="pointer-events-none absolute -ml-3 -mt-3 rounded-full border border-white bg-[#2f6b45] p-1 text-white shadow"
            style={{ left: `${focalX}%`, top: `${focalY}%` }}
          >
            <Crosshair className="h-4 w-4" />
          </span>
        </button>

        <div className="grid content-start gap-3 text-sm">
          <p className="text-stone-600">Click the preview to set the focus point, then tighten or loosen the crop for cards and previews.</p>
          <label className="grid gap-1 font-medium text-stone-800">
            Crop
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.currentTarget.value))}
            />
            <span className="text-xs font-normal text-stone-500">{zoom.toFixed(2)}x</span>
          </label>
          <button
            type="button"
            className="justify-self-start rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 text-xs font-medium text-stone-700"
            onClick={() => {
              setFocalX(50)
              setFocalY(50)
              setZoom(1)
            }}
          >
            Reset framing
          </button>
        </div>
      </div>
    </div>
  )
}
