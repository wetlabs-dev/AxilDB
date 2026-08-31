import { HelpTooltip } from '@/components/ui'
import { plantInstanceTypeHelp, plantInstanceTypeLabel, plantInstanceTypes, type PlantInstanceType } from '@/lib/plant-instance-types'
import { cn } from '@/lib/utils'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export function PlantInstanceTypeSelect({
  name = 'instanceType',
  defaultValue = 'MOTHER',
  values = plantInstanceTypes,
  className,
}: {
  name?: string
  defaultValue?: string
  values?: readonly PlantInstanceType[]
  className?: string
}) {
  return (
    <label className={cn('grid min-w-0 gap-1 text-sm font-medium text-stone-800', className)}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span>Type</span>
        <HelpTooltip>{values.map((value) => plantInstanceTypeHelp(value)).filter(Boolean).join(' ')}</HelpTooltip>
      </span>
      <select className={selectClass} name={name} defaultValue={defaultValue}>
        {values.map((value) => <option key={value} value={value}>{plantInstanceTypeLabel(value)}</option>)}
      </select>
    </label>
  )
}
