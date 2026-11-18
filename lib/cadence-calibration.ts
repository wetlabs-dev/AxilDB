import { loadCareEvidence, assessCareEvidence, cadenceBaseline, careEvidenceSnapshot } from '@/lib/metrics/care-history-adapter'
export { loadCareEvidence, assessCareEvidence, cadenceBaseline, careEvidenceSnapshot } from '@/lib/metrics/care-history-adapter'
export type { CareEvidence } from '@/lib/metrics/care-history-adapter'
import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { cadenceActivities, type Cadence } from '@/lib/care-cadences'
import { calibrationPolicy, type CalibrationPolicy } from '@/lib/calibration-policy'
import { configureDefinitionCadence } from '@/lib/care-cadence-service'

type DB = PrismaClient | Prisma.TransactionClient
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const afterDays = (date: Date, days: number) => new Date(date.getTime()+days*86400000)
export const metricKey = (activity: string) => `care:${activity}`
export const calibrationJobField = (activity: string) => `cadenceCalibration:${activity}`
export async function policyFor(db: DB) { return calibrationPolicy((await db.aiCuratorSettings.findUnique({where:{id:'global'}}))?.calibrationPolicy) }
export async function ensureCalibrationStates(db: DB, collectionId: string, definitionId: string, now = new Date()) {
  await db.plantDefinition.findFirstOrThrow({where:{id:definitionId,collectionId}})
  await db.metricCalibrationState.createMany({data:cadenceActivities.map(({activity})=>({collectionId,plantDefinitionId:definitionId,metricKey:metricKey(activity),nextEligibleAt:now})),skipDuplicates:true})
}

export async function initializeCalibrationBatch(db: PrismaClient, policy: CalibrationPolicy, now = new Date()) {
  const definitions = await db.plantDefinition.findMany({where:{collection:{status:'ACTIVE',aiFeaturesEnabled:true,aiCuratorEnabled:true},metricCalibrations:{none:{metricKey:{startsWith:'care:'}}}},select:{id:true,collectionId:true},orderBy:{id:'asc'},take:policy.batchSize})
  for (const d of definitions) await ensureCalibrationStates(db,d.collectionId!,d.id,now)
}
export async function queueCalibration(db: PrismaClient, input: {collectionId:string;definitionId:string;activity:string;manual?:boolean}, now = new Date()) {
  const policy = await policyFor(db)
  if (!policy.enabled) return null
  if (!cadenceActivities.some(a=>a.activity===input.activity)) throw new Error('Invalid category.')
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
    await tx.collection.findFirstOrThrow({where:{id:input.collectionId,status:'ACTIVE',aiFeaturesEnabled:true,aiCuratorEnabled:true}})
    await ensureCalibrationStates(tx,input.collectionId,input.definitionId,now)
    const state = await tx.metricCalibrationState.findUniqueOrThrow({where:{collectionId_plantDefinitionId_metricKey:{collectionId:input.collectionId,plantDefinitionId:input.definitionId,metricKey:metricKey(input.activity)}}})
    if (input.manual && state.lastRequestedAt && state.lastRequestedAt > afterDays(now,-policy.manualRateLimitHours/24)) return null
    if (!input.manual && (!state.nextEligibleAt || state.nextEligibleAt>now)) return null
    if (await tx.careCadenceProposal.findFirst({where:{plantDefinitionId:input.definitionId,activity:input.activity,status:'PENDING'}})) { await tx.metricCalibrationState.update({where:{id:state.id},data:{nextEligibleAt:afterDays(now,policy.insufficientDays)}}); return null }
    const targetField = calibrationJobField(input.activity)
    if (await tx.aiCuratorJob.findFirst({where:{collectionId:input.collectionId,plantDefinitionId:input.definitionId,targetField,status:{in:['QUEUED','RUNNING','DEFERRED','WAITING_FOR_HUMAN']}}})) { await tx.metricCalibrationState.update({where:{id:state.id},data:{nextEligibleAt:afterDays(now,1)}}); return null }
    const settings = await tx.aiCuratorSettings.findUnique({where:{id:'global'}})
    const job = await tx.aiCuratorJob.create({data:{collectionId:input.collectionId,plantDefinitionId:input.definitionId,jobType:'CADENCE_CALIBRATION',phase:'STEWARDSHIP',targetEntityType:'PLANT_DEFINITION',targetEntityId:input.definitionId,targetField,reason:input.manual?'Prioritized observed cadence reassessment':'Scheduled cadence calibration',priority:input.manual?1000:250,maxAttempts:settings?.maxAttempts || 3,model:settings?.model,estimatedCostDollars:0}})
    await tx.metricCalibrationState.update({where:{id:state.id},data:{lastRequestedAt:now,nextEligibleAt:afterDays(now,1)}})
    return job
  })
}
export async function enqueueCalibrationBatch(db: PrismaClient, now = new Date()) {
  const policy = await policyFor(db)
  if (!policy.enabled) return 0
  await initializeCalibrationBatch(db,policy,now)
  const changes = await db.$queryRaw<Array<{id:string}>>`
    SELECT DISTINCT s.id FROM "MetricCalibrationState" s
    JOIN "PlantInstance" p ON p."plantDefinitionId"=s."plantDefinitionId" AND p."collectionId"=s."collectionId"
    WHERE s."metricKey" LIKE 'care:%' AND s."nextEligibleAt">${now}
      AND s."lastAssessedAt"<${afterDays(now,-policy.manualDays)}
      AND (s."lastRejectedAt" IS NULL OR s."lastRejectedAt"<${afterDays(now,-policy.rejectedDays)})
      AND (s."lastApprovedAt" IS NULL OR s."lastApprovedAt"<${afterDays(now,-policy.appliedDays)})
      AND (EXISTS (SELECT 1 FROM "PlantLocationMove" m WHERE m."plantInstanceId"=p.id AND m."collectionId"=s."collectionId" AND m."movedAt">s."lastAssessedAt")
       OR EXISTS (SELECT 1 FROM "PlantSubstrateHistory" h WHERE h."plantInstanceId"=p.id AND h."collectionId"=s."collectionId" AND h."changedAt">s."lastAssessedAt"))
    LIMIT ${policy.batchSize}`
  if (changes.length) await db.metricCalibrationState.updateMany({where:{id:{in:changes.map(c=>c.id)}},data:{nextEligibleAt:now}})
  const due = await db.metricCalibrationState.findMany({where:{metricKey:{startsWith:'care:'},nextEligibleAt:{lte:now},collection:{status:'ACTIVE',aiFeaturesEnabled:true,aiCuratorEnabled:true}},orderBy:[{nextEligibleAt:'asc'},{id:'asc'}],take:policy.batchSize})
  let count=0
  for (const state of due) if (await queueCalibration(db,{collectionId:state.collectionId,definitionId:state.plantDefinitionId,activity:state.metricKey.slice(5)},now)) count++
  return count
}
export type CalibrationInterpretation = { supportChange: boolean; reasoning: string }
export async function runCalibrationJob(db: PrismaClient, job: {id:string;plantDefinitionId:string|null;collectionId:string;targetField:string|null;claimedBy:string|null}, interpret?: (evidence: unknown)=>Promise<CalibrationInterpretation>, now = new Date()) {
  const activity = job.targetField?.split(':')[1] || '', policy = await policyFor(db)
  if (!policy.enabled) { await db.aiCuratorJob.updateMany({where:{id:job.id,status:'RUNNING',claimedBy:job.claimedBy},data:{status:'SKIPPED',completedAt:now,resultSummary:'Cadence calibration disabled.'}}); return {status:'SKIPPED' as const,cost:0} }
  if (!job.plantDefinitionId) throw new Error('Calibration requires a definition.')
  const state = await db.metricCalibrationState.findUniqueOrThrow({where:{collectionId_plantDefinitionId_metricKey:{collectionId:job.collectionId,plantDefinitionId:job.plantDefinitionId,metricKey:metricKey(activity)}}})
  const evidence = await loadCareEvidence(db,job.collectionId,job.plantDefinitionId,activity,policy,now,state.observationBoundary)
  let result = assessCareEvidence(evidence,policy)
  const changedManually = state.baseline && state.baseline!==evidence.baseline
  if (changedManually) result = {...result,outcome:'CALIBRATING',proposed:null,reason:'Cadence changed; collect new evidence from this baseline.'}
  let interpretation: CalibrationInterpretation | undefined
  if (result.proposed && interpret) {
    interpretation = await interpret({plantIdentity:evidence.plantIdentity,activity,current:evidence.current?{activity:evidence.current.activity,status:evidence.current.status,interval:evidence.current.interval,unit:evidence.current.unit}:null,statistics:evidence.summary,seasonal:evidence.seasonal,warnings:evidence.warnings,husbandry:evidence.husbandryContext,proposal:result.proposed})
    if (!interpretation || typeof interpretation.supportChange!=='boolean' || typeof interpretation.reasoning!=='string' || interpretation.reasoning.length>2000) throw new Error('Invalid calibration interpretation.')
    if (!interpretation.supportChange) result={...result,outcome:'INCONCLUSIVE',proposed:null,reason:interpretation.reasoning}
  }
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
    if (!await tx.aiCuratorJob.findFirst({where:{id:job.id,status:'RUNNING',claimedBy:job.claimedBy,collection:{status:'ACTIVE',aiFeaturesEnabled:true,aiCuratorEnabled:true}}})) return {status:'SKIPPED' as const,cost:0}
    if (digest(await policyFor(tx))!==digest(policy)) throw new Error('Calibration policy changed during assessment.')
    const fresh = await loadCareEvidence(tx,job.collectionId,job.plantDefinitionId!,activity,policy,now,state.observationBoundary)
    if (fresh.fingerprint!==evidence.fingerprint) throw new Error('Evidence changed during assessment; retry safely.')
    const pending = await tx.careCadenceProposal.findFirst({where:{plantDefinitionId:job.plantDefinitionId!,activity,status:'PENDING'}})
    if (pending) result={...result,outcome:'PENDING_RECOMMENDATION',proposed:null,reason:'An existing review must be resolved first.'}
    let proposalId: string | null = null
    if (result.proposed) {
      const proposal = await tx.careCadenceProposal.create({data:{plantDefinitionId:job.plantDefinitionId!,activity,...result.proposed,confidence:result.confidence>=.8?'HIGH':'MEDIUM',rationale:[result.reason,interpretation?.reasoning || 'Deterministic statistical assessment; no model interpretation requested.',...evidence.warnings].join(' '),applicability:'RECOMMENDED',sourceReferences:[],source:'CADENCE_CALIBRATION',jobId:job.id,calibrationEvidence:json({baseline:evidence.baseline,fingerprint:evidence.fingerprint,boundary:state.observationBoundary,current:evidence.current,summary:evidence.summary,confidence:result.confidence,warnings:evidence.warnings,activeInstances:evidence.activeInstances,proposed:result.proposed,assessedAt:now})}})
      proposalId=proposal.id
    }
    const nextEligibleAt = proposalId || ['PENDING_RECOMMENDATION','NOT_APPLICABLE','NO_CADENCE'].includes(result.outcome) ? null : afterDays(now,result.outcome==='STABLE'?policy.stableDays:result.outcome==='INCONCLUSIVE'?policy.inconclusiveDays:policy.insufficientDays)
    await tx.metricCalibrationState.update({where:{id:state.id},data:{outcome:proposalId?'AWAITING_REVIEW':result.outcome,lastAssessedAt:now,nextEligibleAt,baseline:evidence.baseline,evidence:json({result,summary:evidence.summary,warnings:evidence.warnings}),...(state.observationBoundary?{}:{observedSummary:json(careEvidenceSnapshot(evidence)),statisticsAt:now}),proposalId:proposalId || pending?.id || null,stableCount:result.outcome==='STABLE'?{increment:1}:0,...(changedManually?{observationBoundary:now,nextEligibleAt:afterDays(now,policy.manualDays)}:{})}})
    await tx.aiCuratorJob.update({where:{id:job.id},data:{status:'COMPLETED',completedAt:now,resultSummary:`Cadence calibration: ${result.outcome}. ${result.reason}`,confidence:result.confidence}})
    return {status:'COMPLETED' as const,cost:0}
  },{timeout:30000})
}

export async function reviewCalibration(db: PrismaClient, input: {id:string;collectionId:string;reviewerId:string;decision:'approve'|'reject';edit?:{interval:number;unit:string};note?:string}, now=new Date()) {
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
    const p = await tx.careCadenceProposal.findFirstOrThrow({where:{id:input.id,source:'CADENCE_CALIBRATION',plantDefinition:{collectionId:input.collectionId}},include:{job:true}})
    if (p.status!=='PENDING') return 'No longer pending'
    const stored=p.calibrationEvidence as {baseline:string;fingerprint:string;boundary?:string|null;current:Cadence}|null
    if (!stored) throw new Error('Calibration evidence is missing.')
    const policy=await policyFor(tx), where={collectionId_plantDefinitionId_metricKey:{collectionId:input.collectionId,plantDefinitionId:p.plantDefinitionId,metricKey:metricKey(p.activity)}}
    const state=await tx.metricCalibrationState.findUniqueOrThrow({where})
    if (input.decision==='reject') {
      await tx.careCadenceProposal.update({where:{id:p.id},data:{status:'REJECTED',reviewedAt:now,reviewedByUserId:input.reviewerId,reviewNote:input.note?.slice(0,2000)}})
      await tx.metricCalibrationState.update({where,data:{outcome:'REJECTED',nextEligibleAt:afterDays(now,policy.rejectedDays),lastRejectedAt:now,proposalId:null}})
      await tx.auditLog.create({data:{collectionId:input.collectionId,userId:input.reviewerId,action:'UPDATE',entityType:'CADENCE_CALIBRATION',entityId:p.id,summary:'Kept current cadence; calibration rejected',metadata:JSON.stringify({proposed:{interval:p.interval,unit:p.unit},note:input.note})}})
      return 'REJECTED'
    }
    const evidence=await loadCareEvidence(tx,input.collectionId,p.plantDefinitionId,p.activity,policy,now,stored.boundary?new Date(stored.boundary):null)
    if (p.job?.status!=='COMPLETED' || evidence.baseline!==stored.baseline || evidence.fingerprint!==stored.fingerprint || !assessCareEvidence(evidence,policy).proposed) {
      await tx.careCadenceProposal.update({where:{id:p.id},data:{status:'SUPERSEDED',reviewNote:'Stale calibration: cadence, cohort, prerequisite or history changed. Reassess.'}})
      await tx.metricCalibrationState.update({where,data:{outcome:'STALE',proposalId:null,nextEligibleAt:now}})
      return 'Stale calibration; reassess before approval'
    }
    const applied=input.edit || {interval:p.interval!,unit:p.unit!}
    await configureDefinitionCadence(tx,{definitionId:p.plantDefinitionId,activity:p.activity,status:'SCHEDULED',...applied})
    await tx.careCadenceProposal.update({where:{id:p.id},data:{status:'APPROVED',reviewedAt:now,reviewedByUserId:input.reviewerId,approvedInterval:applied.interval,approvedUnit:applied.unit,reviewNote:input.note?.slice(0,2000)}})
    const current=await tx.plantDefinitionCareCadence.findUniqueOrThrow({where:{plantDefinitionId_activity:{plantDefinitionId:p.plantDefinitionId,activity:p.activity}}})
    await tx.metricCalibrationState.update({where,data:{outcome:'CALIBRATING',lastApprovedAt:now,observationBoundary:now,nextEligibleAt:afterDays(now,policy.appliedDays),proposalId:null,baseline:cadenceBaseline(current,p.activity==='FERTILIZING'?(await tx.plantHusbandryGuide.findUnique({where:{plantDefinitionId:p.plantDefinitionId}}))?.fertilizerRecipeId:null)}})
    await tx.auditLog.create({data:{collectionId:input.collectionId,userId:input.reviewerId,action:'UPDATE',entityType:'CADENCE_CALIBRATION',entityId:p.id,summary:`${p.activity} cadence calibration approved`,metadata:JSON.stringify({previous:stored.current,proposed:{interval:p.interval,unit:p.unit},applied,evidence:p.calibrationEvidence})}})
    return 'APPROVED'
  },{timeout:30000})
}
