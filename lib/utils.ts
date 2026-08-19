import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { dateInputValue, formatDate } from '@/lib/time'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
export type BotanicalNameInput = { genus?: string | null; species?: string | null; hybridNotation?: string | null; cultivarName?: string | null; authority?: string | null }
export function acceptedPlantName(p: BotanicalNameInput, options: { includeAuthority?: boolean } = {}) {
  const core = [p.genus?.trim(), p.hybridNotation?.trim(), p.species?.trim()].filter(Boolean).join(' ')
  const cultivar = p.cultivarName?.trim() ? ` '${p.cultivarName.trim()}'` : ''
  const authority = options.includeAuthority && p.authority?.trim() ? ` ${p.authority.trim()}` : ''
  return `${core}${cultivar}${authority}`.trim()
}
export function plantName(p: BotanicalNameInput & { provisionalTaxon?:string|null; identificationStatus?:string|null }, options: { includeAuthority?: boolean } = {}) {
  return p.identificationStatus === 'PROVISIONAL' && p.provisionalTaxon?.trim()
    ? p.provisionalTaxon.trim()
    : acceptedPlantName(p, options)
}
export function plantNeedsIdentification(p: { provisionalTaxon?: string | null; identificationStatus?: string | null }) {
  return p.identificationStatus === 'PROVISIONAL' || Boolean(p.provisionalTaxon?.trim())
}
export function taxonomyLabel(value?: string | null) {
  return value ? value.toLowerCase().replaceAll('_', '-').replaceAll('-', ' ') : 'uncertain'
}
export function fmtDate(d?: Date | string | null, timezone?: string | null) { return formatDate(d, timezone || undefined) }
export function dateInput(d?: Date | string | null, timezone?: string | null) { return dateInputValue(d, timezone || undefined) }
export function money(v?: any) { return v === null || v === undefined || v === '' ? '—' : `$${Number(v).toFixed(2)}` }
