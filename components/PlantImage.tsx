import { Leaf } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PlantImageFrame = {
  path?: string | null
  cropX?: number | null
  cropY?: number | null
  cropWidth?: number | null
  cropHeight?: number | null
  focalX?: number | null
  focalY?: number | null
}

function clampPercent(value: number | null | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, value))
}

function frameStyle(frame?: PlantImageFrame | null) {
  if (!frame) return undefined
  const cropWidth = clampPercent(frame.cropWidth, 100)
  const cropHeight = clampPercent(frame.cropHeight, 100)
  const cropX = clampPercent(frame.cropX, Math.max(0, 50 - cropWidth / 2))
  const cropY = clampPercent(frame.cropY, Math.max(0, 50 - cropHeight / 2))
  const focalX = clampPercent(frame.focalX, Math.min(100, Math.max(0, cropX + cropWidth / 2)))
  const focalY = clampPercent(frame.focalY, Math.min(100, Math.max(0, cropY + cropHeight / 2)))
  const zoom = Math.max(1, Math.min(3, 100 / Math.max(25, Math.min(cropWidth, cropHeight))))

  return {
    objectPosition: `${focalX}% ${focalY}%`,
    transform: zoom > 1.01 ? `scale(${zoom})` : undefined,
    transformOrigin: `${focalX}% ${focalY}%`,
  }
}

export function PlantImage({
  src,
  alt,
  className = '',
}: {
  src?: string | null | PlantImageFrame
  alt: string
  className?: string
}) {
  const frame = typeof src === 'object' && src !== null ? src : null
  const imageSrc = frame ? frame.path : typeof src === 'string' ? src : null

  if (imageSrc) {
    return <img src={imageSrc} alt={alt} className={cn('h-full w-full object-cover', className)} style={frameStyle(frame)} />
  }

  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-[#d6dfc9]/45 text-[#2f6b45]', className)}>
      <Leaf className="h-10 w-10" />
    </div>
  )
}
