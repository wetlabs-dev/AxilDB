import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { prisma } from '@/lib/prisma'
import { requireCollectionManager, collectionPath } from '@/lib/collections'
import { validRequestOrigin } from '@/lib/request-origin'
import { timeZoneForPreference } from '@/lib/time'
import { applyDeconfliction, deconflictionState, previewDeconfliction, publicDeconfliction } from '@/lib/care-deconfliction'
export const dynamic='force-dynamic'
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})
async function scope(slug:string) {
  const context=await requireCollectionManager(slug)
  const preference=await prisma.emailPreference.findUnique({where:{userId:context.user.id}})
  return {collectionId:context.collection.id,collectionSlug:context.collection.slug,userId:context.user.id,timezone:timeZoneForPreference(preference)}
}
export async function GET(req:NextRequest) {
  try {const s=await scope(req.nextUrl.searchParams.get('collectionSlug')||'');return json(await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`care-calendar:${s.collectionId}`}, 0))`
    return publicDeconfliction(await deconflictionState(tx,s))
  },{timeout:30000}))}catch{return json({error:'Collection manager access is required, or the schedule is unavailable.'},403)}
}
export async function POST(req:NextRequest) {
  if(!validRequestOrigin(req))return json({error:'Invalid request origin.'},403)
  try {
    if(!(await getCurrentUser()))return json({error:'Sign in first.'},401)
    const text=await req.text();if(text.length>200000)return json({error:'Choose a smaller batch.'},413)
    const input=JSON.parse(text);if(typeof input.collectionSlug!=='string'||!['preview','apply'].includes(input.operation))return json({error:'Invalid operation.'},400)
    const s=await scope(input.collectionSlug)
    if(input.operation==='preview')return json(await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`care-calendar:${s.collectionId}`}, 0))`
      const p=await previewDeconfliction(tx,s,input.selections)
      return {hash:p.hash,changed:p.changed,exceptions:p.exceptions,earlyWaterings:p.earlyWaterings,impact:p.impact,valid:p.valid.length}
    },{timeout:30000}))
    const result=await applyDeconfliction(prisma,s,input)
    if(result.applied.length)revalidatePath(collectionPath(s.collectionSlug), 'layout')
    return json(result,result.reviewRequired?409:200)
  }catch(error){if(isRedirectError(error)||error instanceof Error&&/permission/i.test(error.message))return json({error:'Collection manager permission is required.'},403);return json({error:'Could not confirm these resolutions. Check collection access and refresh suggestions before retrying.'},400)}
}
