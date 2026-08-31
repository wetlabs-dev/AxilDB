'use client'

import { PlantImage } from '@/components/PlantImage'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

export type PlantDefinitionCascadeOption = {
  id: string
  genus: string
  species: string | null
  hybridNotation: string | null
  cultivarName: string | null
  displayName: string
  isValidated: boolean
  identificationStatus?: string | null
  confidence?: string | null
  taxonomicAuthorityName?: string | null
  readinessLabel?: string | null
  readinessScore?: number | null
  thumbnail?: any
}

const inputClass = 'min-w-0 rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'
const blankSpeciesToken = '__BLANK_SPECIES__'
const blankHybridToken = '__BLANK_HYBRID__'
const blankCultivarToken = '__BLANK_CULTIVAR__'

function clean(value?: string | null) {
  return String(value || '').trim()
}

function uniq(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

function speciesLabel(value: string) {
  if (value === blankSpeciesToken) return 'No species / genus-level cultivar'
  if (value.toLowerCase() === 'sp.') return 'sp. - species unknown'
  return value
}

function hybridLabel(value: string) {
  return value === blankHybridToken ? 'No hybrid designation' : value
}

function cultivarLabel(value: string) {
  return value === blankCultivarToken ? 'No cultivar' : value
}

function matchesInput(value: string, options: string[]) {
  return options.includes(value)
}

function FieldInput({
  label,
  value,
  onChange,
  options,
  optionLabel = (item: string) => item,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  optionLabel?: (value: string) => string
  disabled?: boolean
}) {
  const datalistId = `cascade-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
      {label}
      <span className="flex min-w-0 gap-2">
        <input
          className={inputClass}
          value={value ? optionLabel(value) : ''}
          list={datalistId}
          onChange={(event) => {
            const raw = event.target.value
            const exact = options.find((option) => optionLabel(option).toLowerCase() === raw.toLowerCase()) || raw
            onChange(exact)
          }}
          disabled={disabled}
          autoComplete="off"
        />
        {value && (
          <button type="button" className="rounded-md border border-stone-300 bg-white/70 px-2 text-xs font-semibold" onClick={() => onChange('')}>
            Clear
          </button>
        )}
      </span>
      <datalist id={datalistId}>
        {options.map((option) => <option key={option} value={optionLabel(option)} />)}
      </datalist>
    </label>
  )
}

export function PlantDefinitionCascadePicker({
  name = 'plantDefinitionId',
  definitions,
  defaultValue,
  required = false,
  disabled = false,
  createHref,
}: {
  name?: string
  definitions: PlantDefinitionCascadeOption[]
  defaultValue?: string | null
  required?: boolean
  disabled?: boolean
  createHref?: string
}) {
  const initial = definitions.find((definition) => definition.id === defaultValue)
  const [genus, setGenus] = useState(initial?.genus || '')
  const [species, setSpecies] = useState(initial ? clean(initial.species) || blankSpeciesToken : '')
  const [hybrid, setHybrid] = useState(initial ? clean(initial.hybridNotation) || blankHybridToken : '')
  const [cultivar, setCultivar] = useState(initial ? clean(initial.cultivarName) || blankCultivarToken : '')
  const [explicitDefinitionId, setExplicitDefinitionId] = useState(initial?.id || '')

  const genusOptions = useMemo(() => uniq(definitions.map((definition) => clean(definition.genus)).filter(Boolean)), [definitions])
  const genusValid = matchesInput(genus, genusOptions)
  const genusMatches = useMemo(() => genusValid ? definitions.filter((definition) => definition.genus === genus) : [], [definitions, genus, genusValid])
  const speciesOptions = useMemo(() => uniq(genusMatches.map((definition) => clean(definition.species) || blankSpeciesToken)), [genusMatches])
  const speciesValid = species ? matchesInput(species, speciesOptions) : false
  const speciesMatches = useMemo(() => speciesValid
    ? genusMatches.filter((definition) => (clean(definition.species) || blankSpeciesToken) === species)
    : genusMatches,
  [genusMatches, species, speciesValid])
  const hybridOptions = useMemo(() => uniq(speciesMatches.map((definition) => clean(definition.hybridNotation) || blankHybridToken)), [speciesMatches])
  const showHybrid = hybridOptions.length > 1
  const hybridValid = hybrid ? matchesInput(hybrid, hybridOptions) : false
  const hybridMatches = useMemo(() => showHybrid && hybridValid
    ? speciesMatches.filter((definition) => (clean(definition.hybridNotation) || blankHybridToken) === hybrid)
    : speciesMatches,
  [hybrid, hybridValid, showHybrid, speciesMatches])
  const cultivarOptions = useMemo(() => uniq(hybridMatches.map((definition) => clean(definition.cultivarName) || blankCultivarToken)), [hybridMatches])
  const cultivarValid = cultivar ? matchesInput(cultivar, cultivarOptions) : false
  const cultivarMatches = useMemo(() => cultivarValid
    ? hybridMatches.filter((definition) => (clean(definition.cultivarName) || blankCultivarToken) === cultivar)
    : hybridMatches,
  [cultivar, cultivarValid, hybridMatches])
  const resolved = cultivarMatches.length === 1 ? cultivarMatches[0] : null
  const selectedId = resolved?.id || (cultivarMatches.some((definition) => definition.id === explicitDefinitionId) ? explicitDefinitionId : '')

  useEffect(() => {
    if (!genusValid) {
      setSpecies('')
      setHybrid('')
      setCultivar('')
      setExplicitDefinitionId('')
      return
    }
    if (species && !matchesInput(species, speciesOptions)) {
      setSpecies('')
      setHybrid('')
      setCultivar('')
      setExplicitDefinitionId('')
    }
  }, [genusValid, species, speciesOptions])

  useEffect(() => {
    if (hybrid && !matchesInput(hybrid, hybridOptions)) {
      setHybrid('')
      setCultivar('')
      setExplicitDefinitionId('')
    }
  }, [hybrid, hybridOptions])

  useEffect(() => {
    if (cultivar && !matchesInput(cultivar, cultivarOptions)) {
      setCultivar('')
      setExplicitDefinitionId('')
    }
  }, [cultivar, cultivarOptions])

  return (
    <fieldset className="grid min-w-0 gap-3 rounded-lg border border-[#d6dfc9] bg-[#f5f4e8] p-3 lg:col-span-4">
      <legend className="px-1 text-sm font-bold text-stone-800">Plant definition</legend>
      <input type="hidden" name={name} value={selectedId} required={required} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FieldInput label="Genus" value={genus} onChange={(value) => { setGenus(value); setSpecies(''); setHybrid(''); setCultivar(''); setExplicitDefinitionId('') }} options={genusOptions} disabled={disabled} />
        {genusValid && (
          <FieldInput label="Species" value={species} onChange={(value) => { setSpecies(value); setHybrid(''); setCultivar(''); setExplicitDefinitionId('') }} options={speciesOptions} optionLabel={speciesLabel} disabled={disabled || genusMatches.length === 1} />
        )}
        {genusValid && speciesMatches.length > 1 && showHybrid && (
          <FieldInput label="Hybrid" value={hybrid} onChange={(value) => { setHybrid(value); setCultivar(''); setExplicitDefinitionId('') }} options={hybridOptions} optionLabel={hybridLabel} disabled={disabled} />
        )}
        {genusValid && hybridMatches.length > 1 && (
          <FieldInput label="Cultivar" value={cultivar} onChange={(value) => { setCultivar(value); setExplicitDefinitionId('') }} options={cultivarOptions} optionLabel={cultivarLabel} disabled={disabled} />
        )}
      </div>
      {!genusValid && genus && (
        <div className="rounded-md border border-amber-200 bg-white/65 p-3 text-sm">
          <p className="font-semibold text-stone-800">No matching Plant Definitions.</p>
          {createHref && <Link className="mt-1 inline-flex font-semibold text-[#2f6b45] underline" href={createHref}>Create Plant Definition</Link>}
        </div>
      )}
      {resolved && (
        <div className="flex min-w-0 items-center gap-3 rounded-md border border-stone-200 bg-white/70 p-3 text-sm">
          {resolved.thumbnail && <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-stone-200"><PlantImage src={resolved.thumbnail} alt="" /></div>}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Resolved definition</p>
            <p className="truncate font-semibold text-stone-900">{resolved.displayName}</p>
            <p className="text-xs text-stone-600">
              {resolved.isValidated ? 'Validated definition' : resolved.identificationStatus === 'PROVISIONAL' ? 'Provisional local definition' : 'Local definition'}
              {resolved.taxonomicAuthorityName ? ` · ${resolved.taxonomicAuthorityName}` : ''}
              {resolved.readinessLabel ? ` · ${resolved.readinessLabel}${resolved.readinessScore != null ? ` ${resolved.readinessScore}%` : ''}` : ''}
            </p>
          </div>
        </div>
      )}
      {!resolved && genusValid && cultivarMatches.length > 1 && (
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          {cultivarMatches.length} Plant Definitions match these selections
          <select className={cn(inputClass, 'max-w-xl')} value={explicitDefinitionId} onChange={(event) => setExplicitDefinitionId(event.target.value)} required={required}>
            <option value="">Choose exact definition</option>
            {cultivarMatches.map((definition) => <option key={definition.id} value={definition.id}>{definition.displayName}{definition.isValidated ? ' - Validated' : ''}</option>)}
          </select>
        </label>
      )}
    </fieldset>
  )
}
