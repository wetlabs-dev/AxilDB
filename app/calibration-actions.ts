'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { audit, requireServerAdmin } from '@/lib/auth'
import { requireCollectionAdmin } from '@/lib/collections'
import { queueCalibration } from '@/lib/cadence-calibration'
import { calibrationPolicy } from '@/lib/calibration-policy'
export async function requestCadenceCalibration(fd: FormData) {
  const context = await requireCollectionAdmin(String(fd.get('collectionSlug') || ''))
  const job = await queueCalibration(prisma,{collectionId:context.collection.id,definitionId:String(fd.get('definitionId') || ''),activity:String(fd.get('activity') || ''),manual:true})
  await audit(context.user,'GENERATE','CADENCE_CALIBRATION',job?.id || null,job?'Prioritized cadence calibration':'Calibration already queued, pending review, disabled or rate limited',undefined,context.collection.id)
  revalidatePath('/server/care-cadence-research')
  return {message:job?'Cadence calibration queued. No schedule was changed.':'Already queued, awaiting review, disabled, or requested within the last 24 hours.'}
}
export async function saveCalibrationPolicy(fd: FormData) {
  const user=await requireServerAdmin()
  const policy=calibrationPolicy(JSON.parse(String(fd.get('policy') || '{}')))
  await prisma.aiCuratorSettings.upsert({where:{id:'global'},create:{id:'global',calibrationPolicy:policy},update:{calibrationPolicy:policy}})
  await audit(user,'UPDATE','AI_CURATOR_SETTINGS','global','Updated cadence calibration policy',policy)
  revalidatePath('/server/ai-curator')
}
