import type { CareQueueFilter, CareTaskType } from '@/lib/care-queue'
export type SemanticColor = 'fern'|'moss'|'sage'|'amber'|'rose'|'sky'|'coral'|'ocean'|'violet'|'stone'|'terracotta'|'indigo'
export type CareCategoryPresentation = { category: string; label: string; color: SemanticColor; icon: 'droplets'|'flask'|'layers'|'sprout'|'bug'|'heart'|'flower'|'shield'|'scissors'|'bell' }
// Labels/icons are source-independent. CSS owns theme colors shared with Plant Tags.
export const careCategoryPresentations = {
  WATER: {category:'water',label:'Water',color:'ocean',icon:'droplets'},
  FERTILIZE: {category:'fertilize',label:'Fertilize',color:'fern',icon:'flask'},
  REPOT: {category:'repot',label:'Repot',color:'terracotta',icon:'layers'},
  TREATMENT: {category:'treatment',label:'Treatment',color:'rose',icon:'flask'},
  PROPAGATION_CHECK: {category:'propagation',label:'Propagation check',color:'sky',icon:'sprout'},
  HEALTH_CHECK: {category:'health',label:'Health check',color:'indigo',icon:'heart'},
  QUARANTINE_REVIEW: {category:'quarantine',label:'Quarantine review',color:'indigo',icon:'shield'},
  PEST_CHECK: {category:'pest',label:'Pest check',color:'amber',icon:'bug'},
  BLOOM_CHECK: {category:'bloom',label:'Bloom check',color:'violet',icon:'flower'},
  PRUNE: {category:'prune',label:'Prune',color:'coral',icon:'scissors'},
  REMINDER: {category:'custom',label:'Reminder',color:'stone',icon:'bell'},
} as const satisfies Record<CareTaskType,CareCategoryPresentation>
export function careCategoryPresentation(type: string, label?: string): CareCategoryPresentation {
  if (typeof type !== 'string') return {category:'custom',label:label || 'Care',color:'stone',icon:'bell'}
  if (Object.prototype.hasOwnProperty.call(careCategoryPresentations,type)) return careCategoryPresentations[type as CareTaskType]
  return {category:'custom',label:label || type?.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase()) || 'Care',color:'stone',icon:'bell'}
}
const filterTypes: Partial<Record<CareQueueFilter,CareTaskType>> = {water:'WATER',fertilize:'FERTILIZE',repot:'REPOT',treatment:'TREATMENT',propagation:'PROPAGATION_CHECK',health:'HEALTH_CHECK',pest:'PEST_CHECK',bloom:'BLOOM_CHECK',custom:'REMINDER'}
export function careFilterPresentation(filter:string) {
  const type=Object.prototype.hasOwnProperty.call(filterTypes,filter)?filterTypes[filter as CareQueueFilter]:undefined
  return type?careCategoryPresentation(type):null
}
