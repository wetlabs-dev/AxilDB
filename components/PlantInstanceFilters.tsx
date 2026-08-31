'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeTaxonomyFilter, speciesFilterLabel, type TaxonomyFilterOption } from '@/lib/taxonomy'

const inputClass = 'w-full min-w-0 max-w-full rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-2 text-base font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30 sm:text-sm'

type SelectOption = {
  value: string
  label: string
}

type PlantInstanceFiltersProps = {
  genus: string
  species: string
  location: string
  includeNested: boolean
  tag: string
  type: string
  substrateMode: string
  substrateVersion: string
  substrateComponent: string
  genusOptions: TaxonomyFilterOption[]
  speciesOptionsByGenus: Record<string, TaxonomyFilterOption[]>
  locationOptions: SelectOption[]
  tagOptions: SelectOption[]
  typeOptions: SelectOption[]
  substrateModeOptions: SelectOption[]
  substrateVersionOptions: SelectOption[]
  substrateComponentOptions: SelectOption[]
  visibleCount: number
  totalCount: number
  hasActiveFilters: boolean
  clearHref: string
}

function countLabel(visibleCount: number, totalCount: number, hasActiveFilters: boolean) {
  if (!hasActiveFilters) return `${totalCount} instance${totalCount === 1 ? '' : 's'}`
  return `${visibleCount} of ${totalCount} instance${totalCount === 1 ? '' : 's'}`
}

export function PlantInstanceFilters({
  genus,
  species,
  location,
  includeNested,
  tag,
  type,
  substrateMode,
  substrateVersion,
  substrateComponent,
  genusOptions,
  speciesOptionsByGenus,
  locationOptions,
  tagOptions,
  typeOptions,
  substrateModeOptions,
  substrateVersionOptions,
  substrateComponentOptions,
  visibleCount,
  totalCount,
  hasActiveFilters,
  clearHref,
}: PlantInstanceFiltersProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const latestQuery = useRef(searchParams.toString())
  const [isPending, startTransition] = useTransition()
  const [genusInput, setGenusInput] = useState(genus)
  const [selectedGenus, setSelectedGenus] = useState(genus)
  const [speciesInput, setSpeciesInput] = useState(species ? speciesFilterLabel(species) : '')
  const [selectedSpecies, setSelectedSpecies] = useState(species)
  const speciesOptions = useMemo(
    () => speciesOptionsByGenus[normalizeTaxonomyFilter(selectedGenus)] || [],
    [selectedGenus, speciesOptionsByGenus],
  )
  const speciesEnabled = Boolean(selectedGenus && speciesOptions.length)

  useEffect(() => {
    latestQuery.current = searchParams.toString()
  }, [searchParams])

  useEffect(() => {
    setGenusInput(genus)
    setSelectedGenus(genus)
  }, [genus])

  useEffect(() => {
    setSpeciesInput(species ? speciesFilterLabel(species) : '')
    setSelectedSpecies(species)
  }, [species])

  function replaceUrl(nextParams: URLSearchParams) {
    nextParams.delete('page')
    const query = nextParams.toString()
    latestQuery.current = query
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    })
  }

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(latestQuery.current)
    const clean = value.trim()
    if (clean) params.set(name, clean)
    else params.delete(name)
    replaceUrl(params)
  }

  function setNested(checked: boolean) {
    const params = new URLSearchParams(latestQuery.current)
    params.set('includeNested', checked ? '1' : '0')
    replaceUrl(params)
  }

  function applyGenus(value: string) {
    setSelectedGenus(value)
    setSelectedSpecies('')
    setSpeciesInput('')
    const params = new URLSearchParams(latestQuery.current)
    if (value) params.set('genus', value)
    else params.delete('genus')
    params.delete('species')
    params.delete('definition')
    replaceUrl(params)
  }

  function applySpecies(value: string) {
    setSelectedSpecies(value)
    const params = new URLSearchParams(latestQuery.current)
    if (value) params.set('species', value)
    else params.delete('species')
    params.delete('definition')
    replaceUrl(params)
  }

  useEffect(() => {
    if (!selectedSpecies) return
    if (speciesOptions.some((option) => option.value === selectedSpecies)) return
    setSelectedSpecies('')
    setSpeciesInput('')
    const params = new URLSearchParams(latestQuery.current)
    params.delete('species')
    replaceUrl(params)
  }, [selectedSpecies, speciesOptions])

  function updateGenusInput(value: string) {
    setGenusInput(value)
    const clean = value.trim()
    if (!clean) applyGenus('')
    else {
      const exact = genusOptions.find((option) => option.label.toLocaleLowerCase() === clean.toLocaleLowerCase())
      if (exact) {
        setGenusInput(exact.label)
        applyGenus(exact.value)
      }
    }
  }

  function commitGenusInput() {
    const clean = genusInput.trim()
    if (!clean) applyGenus('')
    else if (!selectedGenus || normalizeTaxonomyFilter(selectedGenus) !== normalizeTaxonomyFilter(clean)) applyGenus(clean)
  }

  function updateSpeciesInput(value: string) {
    setSpeciesInput(value)
    const clean = value.trim()
    if (!clean) applySpecies('')
    else {
      const exact = speciesOptions.find((option) => option.label.toLocaleLowerCase() === clean.toLocaleLowerCase())
      if (exact) {
        setSpeciesInput(exact.label)
        applySpecies(exact.value)
      }
    }
  }

  function commitSpeciesInput() {
    const clean = speciesInput.trim()
    if (!clean) applySpecies('')
    else {
      const exact = speciesOptions.find((option) => option.label.toLocaleLowerCase() === clean.toLocaleLowerCase())
      if (exact) {
        setSpeciesInput(exact.label)
        applySpecies(exact.value)
      }
    }
  }

  return (
    <div className="space-y-3" aria-busy={isPending}>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))] lg:items-end">
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Genus
          <input
            aria-label="Filter Plant Instances by genus"
            className={inputClass}
            value={genusInput}
            list="plant-instance-filter-genera"
            onBlur={commitGenusInput}
            onChange={(event) => updateGenusInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') commitGenusInput() }}
            placeholder="All genera"
            autoComplete="off"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Species
          <input
            aria-label="Filter Plant Instances by species"
            className={cn(inputClass, !speciesEnabled && 'cursor-not-allowed opacity-65')}
            value={speciesInput}
            list="plant-instance-filter-species"
            onBlur={commitSpeciesInput}
            onChange={(event) => updateSpeciesInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') commitSpeciesInput() }}
            placeholder={speciesEnabled ? 'All species' : 'Select a genus first'}
            disabled={!speciesEnabled}
            autoComplete="off"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Location
          <select className={inputClass} value={location} onChange={(event) => setParam('location', event.target.value)}>
            <option value="">All locations</option>
            {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Tag
          <select className={inputClass} value={tag} onChange={(event) => setParam('tag', event.target.value)}>
            <option value="">All tags</option>
            {tagOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Type
          <select className={inputClass} value={type} onChange={(event) => setParam('type', event.target.value)}>
            <option value="">All types</option>
            {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Substrate mode
          <select className={inputClass} value={substrateMode} onChange={(event) => setParam('substrateMode', event.target.value)}>
            <option value="">All substrate modes</option>
            {substrateModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Substrate recipe
          <select className={inputClass} value={substrateVersion} onChange={(event) => setParam('substrateVersion', event.target.value)}>
            <option value="">All recipe versions</option>
            {substrateVersionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Contains component
          <select className={inputClass} value={substrateComponent} onChange={(event) => setParam('substrateComponent', event.target.value)}>
            <option value="">Any component</option>
            {substrateComponentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-stone-300 px-2.5 py-1 font-semibold text-stone-800">
            {countLabel(visibleCount, totalCount, hasActiveFilters)}
          </span>
          {isPending && <span className="text-[#2f6b45]">Updating...</span>}
          <label className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-[#fffdf7] px-2.5 py-1 font-medium text-stone-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#2f6b45]"
              checked={includeNested}
              onChange={(event) => setNested(event.target.checked)}
            />
            Include child locations
          </label>
        </div>
        {hasActiveFilters && (
          <Link className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white/70 px-2.5 py-1 font-semibold text-stone-700 transition hover:bg-white" href={clearHref}>
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Link>
        )}
      </div>

      <datalist id="plant-instance-filter-genera">
        {genusOptions.map((option) => <option key={option.value} value={option.label} label={`${option.count} instances`} />)}
      </datalist>
      <datalist id="plant-instance-filter-species">
        {speciesOptions.map((option) => <option key={option.value} value={option.label} label={`${option.label} (${option.count})`} />)}
      </datalist>
    </div>
  )
}
