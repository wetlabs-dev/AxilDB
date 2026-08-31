'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeTaxonomyFilter, speciesFilterLabel, type TaxonomyFilterOption } from '@/lib/taxonomy'

const inputClass = 'min-w-0 rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-2 text-base font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30 sm:text-sm'

type SelectOption = {
  value: string
  label: string
}

type PlantDefinitionFiltersProps = {
  q: string
  genus: string
  species: string
  taxonomicAuthorityId: string
  authorityType: string
  registrationAuthorityOnly: boolean
  readiness: string
  missing: string
  curatorStatus: string
  genusOptions: TaxonomyFilterOption[]
  speciesOptionsByGenus: Record<string, TaxonomyFilterOption[]>
  authorityOptions: SelectOption[]
  authorityTypeOptions: SelectOption[]
  visibleCount: number
  totalCount: number
  hasActiveFilters: boolean
}

function optionDisplay(option: TaxonomyFilterOption) {
  return `${option.label} (${option.count})`
}

function countLabel(visibleCount: number, totalCount: number, hasActiveFilters: boolean) {
  if (!hasActiveFilters) return `${totalCount} definition${totalCount === 1 ? '' : 's'}`
  return `${visibleCount} of ${totalCount} definition${totalCount === 1 ? '' : 's'}`
}

export function PlantDefinitionFilters({
  q,
  genus,
  species,
  taxonomicAuthorityId,
  authorityType,
  registrationAuthorityOnly,
  readiness,
  missing,
  curatorStatus,
  genusOptions,
  speciesOptionsByGenus,
  authorityOptions,
  authorityTypeOptions,
  visibleCount,
  totalCount,
  hasActiveFilters,
}: PlantDefinitionFiltersProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const latestQuery = useRef(searchParams.toString())
  const [isPending, startTransition] = useTransition()
  const [searchText, setSearchText] = useState(q)
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
    setSearchText(q)
  }, [q])

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

  function setCheckboxParam(name: string, checked: boolean) {
    const params = new URLSearchParams(latestQuery.current)
    if (checked) params.set(name, '1')
    else params.delete(name)
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
    replaceUrl(params)
  }

  function applySpecies(value: string) {
    setSelectedSpecies(value)
    const params = new URLSearchParams(latestQuery.current)
    if (value) params.set('species', value)
    else params.delete('species')
    replaceUrl(params)
  }

  useEffect(() => {
    if (searchText === q) return
    const timeout = window.setTimeout(() => setParam('q', searchText), 250)
    return () => window.clearTimeout(timeout)
  }, [q, searchText])

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

  function clearFilters() {
    const params = new URLSearchParams(latestQuery.current)
    for (const name of ['q', 'genus', 'species', 'taxonomicAuthorityId', 'authorityType', 'registrationAuthority', 'readiness', 'missing', 'curatorStatus', 'tag', 'tagMode', 'page']) {
      params.delete(name)
    }
    setSearchText('')
    setGenusInput('')
    setSelectedGenus('')
    setSpeciesInput('')
    setSelectedSpecies('')
    replaceUrl(params)
  }

  return (
    <div className="space-y-3" aria-busy={isPending}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1.5fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_repeat(4,minmax(10rem,1fr))] xl:items-end">
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Search
          <input
            className={inputClass}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Name, alias, taxonomy..."
            type="search"
            autoComplete="off"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Genus
          <input
            aria-label="Filter Plant Definitions by genus"
            className={inputClass}
            value={genusInput}
            list="plant-definition-filter-genera"
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
            aria-label="Filter Plant Definitions by species"
            className={cn(inputClass, !speciesEnabled && 'cursor-not-allowed opacity-65')}
            value={speciesInput}
            list="plant-definition-filter-species"
            onBlur={commitSpeciesInput}
            onChange={(event) => updateSpeciesInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') commitSpeciesInput() }}
            placeholder={speciesEnabled ? 'All species' : 'Select a genus first'}
            disabled={!speciesEnabled}
            autoComplete="off"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Taxonomic Authority
          <select className={inputClass} value={taxonomicAuthorityId} onChange={(event) => setParam('taxonomicAuthorityId', event.target.value)}>
            <option value="">All authorities</option>
            {authorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Authority type
          <select className={inputClass} value={authorityType} onChange={(event) => setParam('authorityType', event.target.value)}>
            <option value="">All types</option>
            {authorityTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Readiness
          <select className={inputClass} value={readiness} onChange={(event) => setParam('readiness', event.target.value)}>
            <option value="">All readiness states</option>
            <option value="COMPLETE">Complete</option>
            <option value="MOSTLY_COMPLETE">Mostly complete</option>
            <option value="NEEDS_WORK">Needs work</option>
            <option value="SPARSE">Sparse</option>
            <option value="MINIMAL">Minimal</option>
            <option value="PROVISIONAL">Provisional</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          Missing data
          <select className={inputClass} value={missing} onChange={(event) => setParam('missing', event.target.value)}>
            <option value="">Any category</option>
            <option value="images">Missing image</option>
            <option value="husbandry">Missing husbandry</option>
            <option value="fertilizer">Missing fertilizer</option>
            <option value="substrate">Missing substrate</option>
            <option value="authority">Missing authority</option>
            <option value="references">Missing references</option>
            <option value="tags">Missing tags</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
          AI Curator
          <select className={inputClass} value={curatorStatus} onChange={(event) => setParam('curatorStatus', event.target.value)}>
            <option value="">Any Curator state</option>
            <option value="suggested">AI suggested</option>
            <option value="waiting">Waiting for Human</option>
            <option value="complete">Curator complete</option>
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
              checked={registrationAuthorityOnly}
              onChange={(event) => setCheckboxParam('registrationAuthority', event.target.checked)}
            />
            Registration Authorities only
          </label>
        </div>
        {hasActiveFilters && (
          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white/70 px-2.5 py-1 font-semibold text-stone-700 transition hover:bg-white" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>

      <datalist id="plant-definition-filter-genera">
        {genusOptions.map((option) => <option key={option.value} value={option.label} label={`${option.count} definitions`} />)}
      </datalist>
      <datalist id="plant-definition-filter-species">
        {speciesOptions.map((option) => <option key={option.value} value={option.label} label={optionDisplay(option)} />)}
      </datalist>
    </div>
  )
}
