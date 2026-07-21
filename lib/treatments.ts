import { addCalendarDays } from '@/lib/time'

export const treatmentCategories = ['PESTICIDE', 'FUNGICIDE', 'BIOLOGICAL', 'CLEANING', 'CULTURAL', 'OTHER'] as const
export const treatmentConditionTypes = ['PESTS', 'DISEASE', 'FUNGAL', 'ROOT_ISSUE', 'NUTRIENT_ISSUE', 'WILTING', 'YELLOWING_LEAVES', 'CRISPY_LEAVES', 'SUNBURN', 'MECHANICAL_DAMAGE', 'OTHER'] as const
export const treatmentApplicationMethods = ['DRENCH', 'FOLIAR_SPRAY', 'SPOT_TREATMENT', 'DIP', 'WIPE', 'SOIL_AMENDMENT', 'OTHER'] as const
export const treatmentDoseUnits = ['ML', 'L', 'G', 'MG', 'TSP', 'TBSP', 'OZ', 'FL_OZ', 'DROPS', 'OTHER'] as const
export const treatmentEffectiveness = ['INEFFECTIVE', 'SLIGHT', 'MODERATE', 'HIGH', 'UNCERTAIN'] as const
export const treatmentFinalOutcomes = ['RESOLVED', 'IMPROVED', 'UNCHANGED', 'WORSENED', 'STOPPED_ADVERSE_REACTION', 'UNCERTAIN'] as const

export function treatmentSlug(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

export function labelizeTreatment(value?: string | null) {
  return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function addTreatmentDays(date: Date, days: number, timezone?: string) {
  if (timezone) return addCalendarDays(date, days, timezone)
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export type TreatmentSnapshotSource = {
  id: string
  name: string
  category: string
  instructions?: string | null
  manufacturerDoseText?: string | null
  defaultDoseAmount?: number | null
  defaultDoseUnit?: string | null
  defaultWaterVolumeMl?: number | null
  defaultStrength?: string | null
  applicationMethod?: string | null
  minimumIntervalDays?: number | null
  requiresQuarantine?: boolean
  reentryIntervalHours?: number | null
  ventilationRequired?: boolean
  indoorUseAllowed?: boolean | null
  avoidBlooms?: boolean
  avoidHeat?: boolean
  avoidDirectLight?: boolean
  ppeRequirementsJson?: unknown
  safetyNotes?: string | null
  contraindications?: string | null
}

export function treatmentSnapshot(treatment: TreatmentSnapshotSource) {
  return {
    id: treatment.id,
    name: treatment.name,
    category: treatment.category,
    instructions: treatment.instructions || null,
    manufacturerDoseText: treatment.manufacturerDoseText || null,
    defaults: {
      doseAmount: treatment.defaultDoseAmount ?? null,
      doseUnit: treatment.defaultDoseUnit || null,
      waterVolumeMl: treatment.defaultWaterVolumeMl ?? null,
      strength: treatment.defaultStrength || null,
      applicationMethod: treatment.applicationMethod || null,
    },
    safety: {
      minimumIntervalDays: treatment.minimumIntervalDays ?? null,
      requiresQuarantine: Boolean(treatment.requiresQuarantine),
      reentryIntervalHours: treatment.reentryIntervalHours ?? null,
      ventilationRequired: Boolean(treatment.ventilationRequired),
      indoorUseAllowed: treatment.indoorUseAllowed ?? null,
      avoidBlooms: Boolean(treatment.avoidBlooms),
      avoidHeat: Boolean(treatment.avoidHeat),
      avoidDirectLight: Boolean(treatment.avoidDirectLight),
      ppeRequirements: treatment.ppeRequirementsJson || [],
      safetyNotes: treatment.safetyNotes || null,
      contraindications: treatment.contraindications || null,
    },
  }
}

export function buildTreatmentPlanSteps(input: {
  startAt: Date
  treatment: TreatmentSnapshotSource
  repeatCount?: number | null
  repeatIntervalDays?: number | null
  followUpDays?: number | null
  timezone?: string
}) {
  const repeatCount = Math.max(0, Math.min(24, input.repeatCount ?? 0))
  const repeatIntervalDays = Math.max(1, Math.min(365, input.repeatIntervalDays ?? 7))
  const followUpDays = Math.max(1, Math.min(365, input.followUpDays ?? repeatIntervalDays))
  const snapshot = treatmentSnapshot(input.treatment)
  const steps = Array.from({ length: repeatCount + 1 }, (_, index) => ({
    stepType: 'APPLY_TREATMENT',
    title: index === 0 ? `Apply ${input.treatment.name}` : `Repeat ${input.treatment.name} (${index + 1})`,
    scheduledAt: addTreatmentDays(input.startAt, index * repeatIntervalDays, input.timezone),
    sortOrder: index,
    treatmentDefinitionId: input.treatment.id,
    instructions: input.treatment.instructions || null,
    treatmentSnapshotJson: snapshot,
  }))
  steps.push({
    stepType: 'ASSESS_OUTCOME',
    title: 'Assess treatment outcome',
    scheduledAt: addTreatmentDays(input.startAt, repeatCount * repeatIntervalDays + followUpDays, input.timezone),
    sortOrder: steps.length,
    treatmentDefinitionId: input.treatment.id,
    instructions: 'Review the condition response, note adverse effects, and decide whether the plan can be closed.',
    treatmentSnapshotJson: snapshot,
  })
  return steps
}

export function treatmentSafetyWarnings(input: {
  treatment: TreatmentSnapshotSource
  conditionCategory?: string | null
  applicableConditionTypes?: string[]
  tagCautions?: Array<{ warningText: string; severity?: string | null }>
  activeBloom?: boolean
  activeQuarantine?: boolean
  lastAppliedAt?: Date | null
  now?: Date
}) {
  const warnings: Array<{ severity: 'INFO' | 'WARNING' | 'BLOCKING'; message: string }> = []
  const now = input.now || new Date()
  if (input.conditionCategory && input.applicableConditionTypes?.length && !input.applicableConditionTypes.includes(input.conditionCategory)) {
    warnings.push({ severity: 'WARNING', message: `This treatment is not marked for ${labelizeTreatment(input.conditionCategory)} conditions.` })
  }
  if (input.treatment.requiresQuarantine && !input.activeQuarantine) warnings.push({ severity: 'WARNING', message: 'This treatment calls for quarantine, but this plant is not currently quarantined.' })
  if (input.treatment.avoidBlooms && input.activeBloom) warnings.push({ severity: 'WARNING', message: 'This treatment is marked to avoid active blooms.' })
  if (input.treatment.indoorUseAllowed === false) warnings.push({ severity: 'WARNING', message: 'This treatment is not marked for indoor use.' })
  if (input.treatment.ventilationRequired) warnings.push({ severity: 'INFO', message: 'Ventilation is required during application.' })
  if (input.treatment.reentryIntervalHours) warnings.push({ severity: 'INFO', message: `Re-entry interval: ${input.treatment.reentryIntervalHours} hours.` })
  if (input.lastAppliedAt && input.treatment.minimumIntervalDays) {
    const elapsed = Math.floor((now.getTime() - input.lastAppliedAt.getTime()) / 86_400_000)
    if (elapsed < input.treatment.minimumIntervalDays) warnings.push({ severity: 'BLOCKING', message: `Only ${elapsed} day${elapsed === 1 ? '' : 's'} since the last application; the saved minimum interval is ${input.treatment.minimumIntervalDays} days.` })
  }
  for (const caution of input.tagCautions || []) warnings.push({ severity: caution.severity === 'BLOCKING' ? 'BLOCKING' : 'WARNING', message: caution.warningText })
  return warnings
}

export function summarizeTreatmentEffectiveness(plans: Array<{
  finalOutcome?: string | null
  finalEffectiveness?: string | null
  applications?: Array<{ adverseReaction?: boolean; outcomes?: Array<{ effectiveness: string }> }>
}>) {
  const completed = plans.filter((plan) => plan.finalOutcome || plan.finalEffectiveness)
  const effective = completed.filter((plan) => ['RESOLVED', 'IMPROVED'].includes(plan.finalOutcome || '') || ['HIGH', 'MODERATE'].includes(plan.finalEffectiveness || '')).length
  const adverse = plans.flatMap((plan) => plan.applications || []).filter((application) => application.adverseReaction).length
  const rate = completed.length ? Math.round((effective / completed.length) * 100) : null
  return { attempts: plans.length, completed: completed.length, effective, adverse, rate, label: rate == null ? 'Not enough outcomes' : rate >= 75 ? 'Usually effective' : rate >= 45 ? 'Mixed results' : 'Limited success' }
}
