import { Leaf } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PlantImage({
  src,
  alt,
  className = '',
}: {
  src?: string | null
  alt: string
  className?: string
}) {
  if (src) {
    return <img src={src} alt={alt} className={cn('h-full w-full object-cover', className)} />
  }

  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-[#d6dfc9]/45 text-[#2f6b45]', className)}>
      <Leaf className="h-10 w-10" />
    </div>
  )
}
