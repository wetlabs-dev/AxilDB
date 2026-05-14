import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
export function plantName(p: { genus:string; species:string; hybridNotation?:string|null; cultivarName?:string|null }) { return `${p.genus} ${p.hybridNotation ? p.hybridNotation + ' ' : ''}${p.species}${p.cultivarName ? ` '${p.cultivarName}'` : ''}` }
export function fmtDate(d?: Date | string | null) { return d ? new Date(d).toLocaleDateString() : '—' }
export function dateInput(d?: Date | string | null) { return d ? new Date(d).toISOString().slice(0,10) : '' }
export function money(v?: any) { return v === null || v === undefined || v === '' ? '—' : `$${Number(v).toFixed(2)}` }
