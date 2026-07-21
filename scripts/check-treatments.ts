import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTreatmentPlanSteps, parseTreatmentPlanDraft, summarizeTreatmentEffectiveness, treatmentSafetyWarnings, treatmentSlug } from '@/lib/treatments'

const treatment = {
  id: 'treatment-1', name: 'Neem follow-up', category: 'BIOLOGICAL', instructions: 'Verify the label first.',
  minimumIntervalDays: 7, requiresQuarantine: true, ventilationRequired: true, avoidBlooms: true,
}
assert.equal(treatmentSlug('  Neem & Soap  '), 'neem-soap')
const steps = buildTreatmentPlanSteps({ startAt: new Date('2026-07-21T12:00:00Z'), treatment, repeatCount: 2, repeatIntervalDays: 5, followUpDays: 3 })
assert.equal(steps.length, 4)
assert.equal(steps[2].scheduledAt.toISOString(), '2026-07-31T12:00:00.000Z')
assert.equal(steps[3].stepType, 'ASSESS_OUTCOME')
assert.equal(steps[3].scheduledAt.toISOString(), '2026-08-03T12:00:00.000Z')
const customSteps = parseTreatmentPlanDraft('START_QUARANTINE | 0 | Isolate plant\nAPPLY_TREATMENT | 2 | Apply treatment\nASSESS_OUTCOME | 7 | Review response', new Date('2026-07-21T12:00:00Z'), treatment, 'UTC')
assert.deepEqual(customSteps.map((step) => step.stepType), ['START_QUARANTINE', 'APPLY_TREATMENT', 'ASSESS_OUTCOME'])
assert.equal(customSteps[2].scheduledAt.toISOString(), '2026-07-28T12:00:00.000Z')

const warnings = treatmentSafetyWarnings({ treatment, activeBloom: true, activeQuarantine: false, lastAppliedAt: new Date('2026-07-18T12:00:00Z'), now: new Date('2026-07-21T12:00:00Z') })
assert.ok(warnings.some((warning) => warning.severity === 'BLOCKING' && warning.message.includes('minimum interval')))
assert.ok(warnings.some((warning) => warning.message.includes('quarantine')))
assert.ok(warnings.some((warning) => warning.message.includes('blooms')))

const summary = summarizeTreatmentEffectiveness([
  { finalOutcome: 'RESOLVED', finalEffectiveness: 'HIGH', applications: [{ adverseReaction: false }] },
  { finalOutcome: 'UNCHANGED', finalEffectiveness: 'SLIGHT', applications: [{ adverseReaction: true }] },
])
assert.equal(summary.completed, 2)
assert.equal(summary.effective, 1)
assert.equal(summary.rate, 50)
assert.equal(summary.adverse, 1)

const schema = readFileSync('prisma/schema.prisma', 'utf8')
for (const model of ['TreatmentDefinition', 'TreatmentProduct', 'TreatmentPlan', 'TreatmentPlanStep', 'TreatmentApplication', 'TreatmentApplicationOutcome', 'TreatmentApplicationBatch', 'TreatmentApplicationBatchItem']) {
  assert.match(schema, new RegExp(`model ${model} \\{`))
}
assert.match(schema, /@@unique\(\[collectionId, slug\]\)/)
assert.match(schema, /treatmentPlanStepId\s+String\?\s+@unique/)

const migration = readFileSync('prisma/migrations/20260721120000_treatment_management/migration.sql', 'utf8')
assert.match(migration, /CREATE TABLE "TreatmentApplication"/)
assert.match(migration, /TreatmentApplication_treatmentPlanStepId_key/)
assert.match(migration, /ON DELETE RESTRICT/)
const completionMigration = readFileSync('prisma/migrations/20260721170000_complete_treatment_management/migration.sql', 'utf8')
assert.match(completionMigration, /CREATE TABLE "TreatmentApplicationBatch"/)
assert.match(completionMigration, /TreatmentApplicationBatch_collectionId_idempotencyKey_key/)

const actions = readFileSync('app/treatment-actions.ts', 'utf8')
assert.match(actions, /requireCollectionGardener/)
assert.match(actions, /requireCollectionLogger/)
assert.match(actions, /status: 'IN_PROGRESS'/)
assert.match(actions, /treatmentSnapshot\(context\.treatment\)\.safety/)
assert.match(actions, /acknowledgeWarnings/)
assert.match(actions, /correctionReason/)
assert.match(actions, /recordBatchTreatmentApplications/)
assert.match(actions, /collectionId_idempotencyKey/)
assert.match(actions, /warningSnapshotJson/)
assert.match(actions, /START_QUARANTINE/)
assert.match(actions, /RELEASE_QUARANTINE/)
assert.match(actions, /acknowledgeActivePlans/)

const planPage = readFileSync('app/treatments/plans/[id]/page.tsx', 'utf8')
assert.match(planPage, /treatmentSafetyWarnings/)
assert.match(planPage, /Review before applying/)
assert.match(planPage, /Correct application record/)
assert.match(planPage, /TREATMENT_PLAN_STEP/)
assert.match(planPage, /after uploading a photo/)

const batchPage = readFileSync('app/treatments/batch/page.tsx', 'utf8')
assert.match(batchPage, /Include nested locations/)
assert.match(batchPage, /Override shared values/)
assert.match(batchPage, /name="acknowledgeWarnings"/)

const searchPage = readFileSync('app/search/page.tsx', 'utf8')
assert.match(searchPage, /canSearchTreatments/)
assert.match(searchPage, /membership\?\.status === 'ACTIVE'/)

const instancePage = readFileSync('app/instances/[id]/page.tsx', 'utf8')
assert.match(instancePage, /canViewTreatmentRecords/)

const exportRoute = readFileSync('app/api/exports/treatments/route.ts', 'utf8')
assert.match(exportRoute, /requireCollectionGardener/)
assert.match(exportRoute, /doseUnit/)

const careQueue = readFileSync('lib/care-queue.ts', 'utf8')
assert.match(careQueue, /source: 'treatment-plan'/)
assert.match(careQueue, /status: 'PENDING', plan: \{ status: 'ACTIVE'/)
assert.match(careQueue, /\/treatments\/plans\/\$\{step\.plan\.id\}/)

const greenThumb = readFileSync('app/api/ai/green-thumb/route.ts', 'utf8')
assert.match(greenThumb, /collectionTreatmentOptions/)
assert.match(greenThumb, /collectionId: collection\.id, active: true/)
assert.doesNotMatch(greenThumb, /member.*collectionTreatmentOptions/i)

console.log('Treatment management checks passed.')
