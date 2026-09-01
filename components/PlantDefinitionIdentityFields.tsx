'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { HelpTooltip } from '@/components/HelpTooltip'
import { cn } from '@/lib/utils'

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'
const identityFields = ['genus', 'species', 'hybridNotation', 'cultivarName'] as const

type IdentityFieldName = typeof identityFields[number]

type Match = {
  id: string
  name: string
  href: string
}

type FieldConfig = {
  name: IdentityFieldName
  label: string
  help: string
  list?: string
  autoCapitalize?: string
}

const fields: FieldConfig[] = [
  {
    name: 'genus',
    label: 'Genus',
    help: 'Required for an identified definition. For an unresolved plant, enter a provisional taxon below and AxilDB will retain a working placement for IDs.',
    list: 'definition-genus-suggestions',
  },
  {
    name: 'species',
    label: 'Species',
    help: 'Species epithet. Leave blank when the accepted horticultural name intentionally omits species (for example, Begonia \'Looking Glass\'). Use sp. only when the species is genuinely unknown.',
    list: 'definition-species-suggestions',
    autoCapitalize: 'none',
  },
  {
    name: 'hybridNotation',
    label: 'Hybrid notation',
    help: 'Use for botanical hybrid markers or formula context, such as x, grex, or parentage notation that belongs with the name.',
    list: 'definition-hybrid-notation-suggestions',
  },
  {
    name: 'cultivarName',
    label: 'Cultivar name',
    help: 'The named cultivated variety, usually written in single quotes, such as \'Morning Glow\'. Leave blank for unnamed species or clones.',
    list: 'definition-cultivar-name-suggestions',
  },
]

function fieldValue(root: HTMLDivElement | null, name: IdentityFieldName) {
  const input = root?.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  return input?.value.trim() || ''
}

function identityKey(values: Record<IdentityFieldName, string>) {
  return identityFields.map((field) => values[field]).join('\u001f')
}

export function PlantDefinitionIdentityFields({
  collectionSlug,
  defaultValues = {},
}: {
  collectionSlug: string
  defaultValues?: Partial<Record<IdentityFieldName, string | null>>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastCheckedKeyRef = useRef('')
  const [match, setMatch] = useState<Match | null>(null)
  const [matchKey, setMatchKey] = useState('')

  function readIdentity() {
    return {
      genus: fieldValue(rootRef.current, 'genus'),
      species: fieldValue(rootRef.current, 'species'),
      hybridNotation: fieldValue(rootRef.current, 'hybridNotation'),
      cultivarName: fieldValue(rootRef.current, 'cultivarName'),
    }
  }

  function clearStaleMatch() {
    if (!match) return
    if (identityKey(readIdentity()) !== matchKey) setMatch(null)
  }

  async function checkForExistingDefinition() {
    const values = readIdentity()
    const key = identityKey(values)
    if (!values.genus) {
      lastCheckedKeyRef.current = ''
      setMatch(null)
      setMatchKey('')
      return
    }
    if (key === lastCheckedKeyRef.current) return

    lastCheckedKeyRef.current = key
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const params = new URLSearchParams({ collectionSlug, ...values })
    try {
      const response = await fetch(`/api/plant-definition-match?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error('Match lookup failed.')
      const result = await response.json()
      if (controller.signal.aborted) return
      setMatch(result.match || null)
      setMatchKey(result.match ? key : '')
    } catch (error) {
      if (!controller.signal.aborted) {
        setMatch(null)
        setMatchKey('')
      }
    }
  }

  return (
    <div ref={rootRef} className="contents">
      {fields.map((field) => (
        <label key={field.name} className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">{field.label}</span>
            <HelpTooltip>{field.help}</HelpTooltip>
          </span>
          <input
            className={cn(control, 'min-w-0 max-w-full')}
            name={field.name}
            list={field.list}
            autoCapitalize={field.autoCapitalize}
            defaultValue={defaultValues[field.name] || ''}
            onBlur={checkForExistingDefinition}
            onInput={clearStaleMatch}
          />
        </label>
      ))}
      {match && (
        <p className="rounded-md border border-[#b7caa9] bg-[#edf3e6] px-3 py-2 text-sm text-[#255537] lg:col-span-4">
          Definition already exists:{' '}
          <Link className="font-semibold underline" href={match.href}>
            {match.name}
          </Link>
        </p>
      )}
    </div>
  )
}
