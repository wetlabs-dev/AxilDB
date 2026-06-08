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

function sunshineAnchor(targetType: SunshineTargetType, targetId: string) {
  return `sunshine-${targetType.toLowerCase()}-${targetId}`
}

function backToSunshine(back: string, targetType: SunshineTargetType, targetId: string) {
  return `${back.split('#')[0] || '/'}#${sunshineAnchor(targetType, targetId)}`
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
  const anchor = sunshineAnchor(targetType, targetId)

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs', compact ? 'justify-between' : '')}>
      <span className="rounded-full border border-[#e7c45a] bg-[#fff8d8] px-2 py-1 font-semibold text-[#6c5300]">
        {sunshineCountLabel(count)}
      </span>
      {count >= WELL_LOVED_THRESHOLD && (
        <span className="rounded-full border border-[#e4a950] bg-[#fff3d1] px-2 py-1 font-bold text-[#7a4b00]">☀️ Well Loved</span>
      )}
      {canToggle ? (
        <form id={anchor} action={toggleSunshine}>
          <input type="hidden" name="collectionSlug" value={collectionSlug} />
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="back" value={backToSunshine(back, targetType, targetId)} />
          <Button
            className={cn(
              'px-2.5 py-1.5 text-xs',
              active
                ? 'border border-[#f7c948] bg-[#f9b934] text-[#1f1600] shadow-[0_0_0_1px_rgba(255,248,216,0.55),0_6px_14px_rgba(0,0,0,0.18)] hover:bg-[#ffd15a]'
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
