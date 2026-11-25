import type { CareQueueGroupingMode, CareQueueLocationSort } from '@/lib/care-queue-locations'
export type CarePresentation = { grouping: CareQueueGroupingMode; locationSort: CareQueueLocationSort }
export type CareViewPreference = { version: 1; mode: 'last' | 'default'; last: CarePresentation; saved: CarePresentation | null }
export const careViewDefaults: CarePresentation = { grouping: 'parent', locationSort: 'tree' }
export const groupingLabels = { parent: 'Parent grouped', flat: 'Flat paths', hierarchy: 'Full hierarchy' }
export const locationSortLabels = { tree: 'Tree order', alphabetical: 'Alphabetical', items: 'Most items due', overdue: 'Most overdue' }
export function validCarePresentation(value: unknown): value is CarePresentation {
  if (!value || typeof value !== 'object') return false
  const v = value as CarePresentation
  return Object.hasOwn(groupingLabels,v.grouping) && Object.hasOwn(locationSortLabels,v.locationSort)
}
export function decodeCareView(value?: string | null): CareViewPreference {
  const fallback: CareViewPreference = { version: 1, mode: 'last', last: {...careViewDefaults}, saved: null }
  try {
    const parsed=JSON.parse(value || '')
    if(parsed.version!==1)return fallback
    const saved=validCarePresentation(parsed.saved)?parsed.saved:null
    return { version:1, mode:parsed.mode==='default'&&saved?'default':'last', last:validCarePresentation(parsed.last)?parsed.last:{...careViewDefaults}, saved }
  }catch{return fallback}
}
export function resolveCareView(preference:CareViewPreference, explicit:{grouping?:string;locationSort?:string} = {}):CarePresentation {
  const base=preference.mode==='default'&&preference.saved?preference.saved:preference.last
  return {grouping:explicit.grouping&&Object.hasOwn(groupingLabels,explicit.grouping)?explicit.grouping as CareQueueGroupingMode:base.grouping,locationSort:explicit.locationSort&&Object.hasOwn(locationSortLabels,explicit.locationSort)?explicit.locationSort as CareQueueLocationSort:base.locationSort}
}
export type CareViewCommand={action:'remember'|'saveDefault';view:CarePresentation}|{action:'mode';mode:'last'|'default'}|{action:'reset'}
export function applyCareViewCommand(preference:CareViewPreference,input:CareViewCommand):CareViewPreference {
  if(!input||!['remember','saveDefault','mode','reset'].includes(input.action))throw new Error('Choose a supported view action.')
  if(input.action==='reset')return decodeCareView()
  if(input.action==='mode'){
    if(!['last','default'].includes(input.mode)||input.mode==='default'&&!preference.saved)throw new Error('Save a default view before enabling it.')
    return {...preference,mode:input.mode}
  }
  if(!validCarePresentation(input.view))throw new Error('Choose supported grouping and location order values.')
  const view={grouping:input.view.grouping,locationSort:input.view.locationSort}
  return input.action==='saveDefault'?{version:1,mode:'default',last:view,saved:view}:{...preference,last:view}
}

/** Only presentation follows an operation; transient care filters are not startup preferences. */
export function careViewContinuation(value: unknown): string {
  if(typeof value !== 'string')return ''
  const [grouping,locationSort,...extra]=value.split(':')
  return !extra.length&&validCarePresentation({grouping,locationSort})?`${grouping}:${locationSort}`:''
}
export function careViewReturnQuery(value: unknown): string {
  const context=careViewContinuation(value)
  if(!context)return ''
  const [grouping,locationSort]=context.split(':')
  return `?${new URLSearchParams({grouping,locationSort})}`
}
