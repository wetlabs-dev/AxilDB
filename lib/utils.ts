import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { dateInputValue, formatDate } from '@/lib/time'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
export function acceptedPlantName(p: { genus:string; species:string; hybridNotation?:string|null; cultivarName?:string|null }) { return `${p.genus} ${p.hybridNotation ? p.hybridNotation + ' ' : ''}${p.species}${p.cultivarName ? ` '${p.cultivarName}'` : ''}` }
export function plantName(p: { genus:string; species:string; hybridNotation?:string|null; cultivarName?:string|null; provisionalTaxon?:string|null; identificationStatus?:string|null }) {
  return p.identificationStatus === 'PROVISIONAL' && p.provisionalTaxon?.trim()
    ? p.provisionalTaxon.trim()
    : acceptedPlantName(p)
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
