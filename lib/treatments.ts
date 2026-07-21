import { addCalendarDays } from '@/lib/time'

export const treatmentCategories = ['CHEMICAL', 'BIOLOGICAL', 'MECHANICAL', 'ENVIRONMENTAL', 'CULTURAL', 'PHYSICAL_BARRIER', 'ISOLATION', 'SANITATION', 'PESTICIDE', 'FUNGICIDE', 'CLEANING', 'OTHER'] as const
export const treatmentConditionTypes = ['PESTS', 'DISEASE', 'FUNGAL', 'ROOT_ISSUE', 'NUTRIENT_ISSUE', 'WILTING', 'YELLOWING_LEAVES', 'CRISPY_LEAVES', 'SUNBURN', 'MECHANICAL_DAMAGE', 'OTHER'] as const
export const treatmentApplicationMethods = ['FOLIAR_SPRAY', 'SOIL_DRENCH', 'ROOT_DIP', 'TOP_DRESS', 'SUBSTRATE_APPLICATION', 'TRAP', 'BARRIER', 'MANUAL_REMOVAL', 'ENVIRONMENTAL_ADJUSTMENT', 'ISOLATION', 'PRUNING', 'WIPE_DOWN', 'DRENCH', 'SPOT_TREATMENT', 'DIP', 'WIPE', 'SOIL_AMENDMENT', 'OTHER'] as const
export const treatmentDoseUnits = ['ML', 'L', 'G', 'MG', 'TSP', 'TBSP', 'OZ', 'FL_OZ', 'DROPS', 'OTHER'] as const
export const treatmentEffectiveness = ['INEFFECTIVE', 'SLIGHT', 'MODERATE', 'HIGH', 'UNCERTAIN'] as const
export const treatmentFinalOutcomes = ['RESOLVED', 'IMPROVED', 'UNCHANGED', 'WORSENED', 'STOPPED_ADVERSE_REACTION', 'UNCERTAIN'] as const
export const treatmentApplicationOutcomes = ['UNKNOWN', 'NO_CHANGE', 'IMPROVED', 'RESOLVED', 'WORSENED', 'ADVERSE_REACTION', 'RECURRENCE'] as const
export const treatmentTargetAreas = ['FOLIAGE', 'STEMS', 'SOIL_MEDIA', 'ROOTS', 'WHOLE_PLANT', 'POT_CONTAINER', 'LOCATION_ENVIRONMENT', 'MULTIPLE', 'OTHER'] as const
export const treatmentPetSafety = ['SAFE_WHEN_USED_AS_DIRECTED', 'KEEP_PETS_AWAY_UNTIL_DRY', 'TOXIC_TO_PETS', 'UNKNOWN', 'NOT_APPLICABLE'] as const
export const treatmentSuitability = ['PRIMARY', 'SUPPORTIVE', 'POSSIBLE', 'NOT_RECOMMENDED'] as const
export const treatmentStepTypes = ['APPLY_TREATMENT', 'PEST_CHECK', 'HEALTH_CHECK', 'PHOTO', 'NOTE', 'RELOCATE', 'START_QUARANTINE', 'RELEASE_QUARANTINE', 'REMINDER', 'MANUAL_TASK', 'ASSESS_OUTCOME'] as const

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
  targetArea?: string | null
  minimumIntervalDays?: number | null
  requiresQuarantine?: boolean
  petSafety?: string | null
  reentryIntervalHours?: number | null
  ventilationRequired?: boolean
  indoorUseAllowed?: boolean | null
  outdoorApplicationPreferred?: boolean
  keepAwayAquaticSystems?: boolean
  temperatureMinC?: number | null
  temperatureMaxC?: number | null
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
      targetArea: treatment.targetArea || null,
    },
    safety: {
      minimumIntervalDays: treatment.minimumIntervalDays ?? null,
      requiresQuarantine: Boolean(treatment.requiresQuarantine),
      petSafety: treatment.petSafety || null,
      reentryIntervalHours: treatment.reentryIntervalHours ?? null,
      ventilationRequired: Boolean(treatment.ventilationRequired),
      indoorUseAllowed: treatment.indoorUseAllowed ?? null,
      outdoorApplicationPreferred: Boolean(treatment.outdoorApplicationPreferred),
      keepAwayAquaticSystems: Boolean(treatment.keepAwayAquaticSystems),
      temperatureMinC: treatment.temperatureMinC ?? null,
      temperatureMaxC: treatment.temperatureMaxC ?? null,
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

export function parseTreatmentPlanDraft(input: string, startAt: Date, treatment: TreatmentSnapshotSource, timezone?: string) {
  const snapshot = treatmentSnapshot(treatment)
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 60).map((line, sortOrder) => {
    const [rawType, rawDays, ...titleParts] = line.split('|').map((part) => part.trim())
    const stepType = treatmentStepTypes.includes(rawType as typeof treatmentStepTypes[number]) ? rawType : 'MANUAL_TASK'
    const offsetDays = Math.max(0, Math.min(730, Number.parseInt(rawDays, 10) || 0))
    const title = titleParts.join(' | ').slice(0, 200) || labelizeTreatment(stepType)
    return {
      stepType, title, scheduledAt: addTreatmentDays(startAt, offsetDays, timezone), timingMode: offsetDays ? 'OFFSET_FROM_PLAN_START' : 'IMMEDIATE', offsetDays,
      sortOrder, treatmentDefinitionId: stepType === 'APPLY_TREATMENT' ? treatment.id : null,
      instructions: stepType === 'APPLY_TREATMENT' ? treatment.instructions || null : null,
      treatmentSnapshotJson: stepType === 'APPLY_TREATMENT' ? snapshot : null,
    }
  })
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
  if (input.treatment.outdoorApplicationPreferred) warnings.push({ severity: 'INFO', message: 'Outdoor application is preferred.' })
  if (input.treatment.keepAwayAquaticSystems) warnings.push({ severity: 'WARNING', message: 'Keep this treatment away from aquariums and other aquatic systems.' })
  if (input.treatment.petSafety === 'TOXIC_TO_PETS') warnings.push({ severity: 'WARNING', message: 'This treatment is marked toxic to pets.' })
  if (input.treatment.petSafety === 'KEEP_PETS_AWAY_UNTIL_DRY') warnings.push({ severity: 'INFO', message: 'Keep pets away until the application is dry.' })
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
  const sampleLabel = completed.length < 3 ? 'Raw counts only' : completed.length < 10 ? 'Limited sample' : 'Descriptive collection history'
  return { attempts: plans.length, completed: completed.length, effective, adverse, rate, sampleLabel, showPercentage: completed.length >= 3, label: rate == null ? 'Not enough outcomes' : rate >= 75 ? 'Usually effective' : rate >= 45 ? 'Mixed results' : 'Limited success' }
}
