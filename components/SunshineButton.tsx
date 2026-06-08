import { toggleSunshine } from '@/app/actions'
import { Button } from '@/components/ui'
import { sunshineCountLabel, WELL_LOVED_THRESHOLD, type SunshineTargetType } from '@/lib/sunshine'
import { cn } from '@/lib/utils'

type SunshineButtonProps = {
  collectionSlug: string
  targetType: SunshineTargetType
  targetId: string
  count: number
  active: boolean
  canToggle: boolean
  back: string
  compact?: boolean
}

export function SunshineButton({
  collectionSlug,
  targetType,
  targetId,
  count,
  active,
  canToggle,
  back,
  compact = false,
}: SunshineButtonProps) {
  const buttonLabel = active ? '☀️ Sunshined' : '☀️ Give Sunshine'

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs', compact ? 'justify-between' : '')}>
      <span className="rounded-full border border-[#e7c45a] bg-[#fff8d8] px-2 py-1 font-semibold text-[#6c5300]">
        {sunshineCountLabel(count)}
      </span>
      {count >= WELL_LOVED_THRESHOLD && (
        <span className="rounded-full border border-[#e4a950] bg-[#fff3d1] px-2 py-1 font-bold text-[#7a4b00]">☀️ Well Loved</span>
      )}
      {canToggle ? (
        <form action={toggleSunshine}>
          <input type="hidden" name="collectionSlug" value={collectionSlug} />
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="back" value={back} />
          <Button
            className={cn(
              'px-2.5 py-1.5 text-xs',
              active
                ? 'border border-[#d5a12e] bg-[#fff3cf] text-[#6c5300] hover:bg-[#ffe7a8]'
                : 'bg-[#2f6b45] text-white',
            )}
          >
            {buttonLabel}
          </Button>
        </form>
      ) : (
        <span className="rounded-md border border-stone-200 bg-white/55 px-2.5 py-1.5 text-xs font-medium text-stone-600">
          Sign in to give sunshine
        </span>
      )}
    </div>
  )
}
