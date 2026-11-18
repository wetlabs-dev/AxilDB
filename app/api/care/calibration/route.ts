import { NextRequest, NextResponse } from 'next/server'
import { requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { cadenceActivities } from '@/lib/care-cadences'
import { careEvidenceSnapshot } from '@/lib/metrics/care-history-adapter'
import { ensureCalibrationStates, loadCareEvidence, policyFor, metricKey } from '@/lib/cadence-calibration'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest) {
  try {
    const context=await requireCollectionViewer(req.nextUrl.searchParams.get('collectionSlug') || '')
    // Public collection visibility never grants private care-history access.
    if (!context.user || !context.membership && context.user.role!=='SERVER_ADMIN') return NextResponse.json({error:'Collection membership is required.'},{status:403})
    const definitionId=req.nextUrl.searchParams.get('definitionId') || ''
    await prisma.plantDefinition.findFirstOrThrow({where:{id:definitionId,collectionId:context.collection.id}})
    const policy=await policyFor(prisma), now=new Date()
    await ensureCalibrationStates(prisma,context.collection.id,definitionId,now)
    const states=await prisma.metricCalibrationState.findMany({where:{collectionId:context.collection.id,plantDefinitionId:definitionId,metricKey:{startsWith:'care:'}}})
    const summaries=[]
    for (const category of cadenceActivities) {
      const state=states.find(s=>s.metricKey===metricKey(category.activity))!
      // Short cache is independent of formal cooldown. No work occurs on care-completion requests.
      let evidence=state.observedSummary
      if (!state.statisticsAt || now.getTime()-state.statisticsAt.getTime()>60000) {
        const calculated=await loadCareEvidence(prisma,context.collection.id,definitionId,category.activity,policy,now)
        evidence=JSON.parse(JSON.stringify(careEvidenceSnapshot(calculated)))
        await prisma.metricCalibrationState.updateMany({where:{id:state.id,updatedAt:state.updatedAt},data:{observedSummary:evidence!,statisticsAt:now}})
      }
      summaries.push({activity:category.activity,outcome:state.outcome,lastAssessedAt:state.lastAssessedAt,nextEligibleAt:state.nextEligibleAt,statisticsAt:state.statisticsAt && now.getTime()-state.statisticsAt.getTime()<=60000?state.statisticsAt:now,proposalId:state.proposalId,evidence})
    }
    return NextResponse.json({summaries},{headers:{'Cache-Control':'private, no-store'}})
  } catch { return NextResponse.json({error:'Calibration statistics unavailable for this collection.'},{status:403}) }
}
