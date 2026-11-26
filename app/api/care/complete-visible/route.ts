import {NextRequest,NextResponse} from 'next/server'
import {revalidatePath} from 'next/cache'
import {isRedirectError} from 'next/dist/client/components/redirect-error'
import {validRequestOrigin} from '@/lib/request-origin'
import {requireCollectionLogger,collectionPath} from '@/lib/collections'
import {prisma} from '@/lib/prisma'
import {reviewVisibleCare,completeVisibleCare} from '@/lib/visible-care-service'
import {CareOperationConflict} from '@/lib/care-queue-operations'
export const dynamic='force-dynamic'
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export async function POST(request:NextRequest){
 if(!validRequestOrigin(request))return json({error:'Invalid request origin.'},403)
 try{
  const raw=await request.text();if(raw.length>250000)return json({error:'Batch is too large.'},413)
  const input=JSON.parse(raw);if(typeof input?.collectionSlug!=='string')return json({error:'Choose a collection.'},400)
  const context=await requireCollectionLogger(input.collectionSlug)
  if(input.action==='review')return json({review:await reviewVisibleCare(prisma,context,input.keys)})
  if(input.action!=='complete')return json({error:'Choose a supported action.'},400)
  const result=await completeVisibleCare(prisma,context,input.entries,input.sharedNote||'',{operationId:input.operationId,issuedAt:input.issuedAt})
  for(const path of ['/','/care','/care/checklist','/instances'])revalidatePath(collectionPath(context.collection.slug,path))
  return json({result})
 }catch(error){
  if(isRedirectError(error)||error instanceof Error&&/permission/i.test(error.message))return json({error:'Permission to record care is required.'},403)
  if(error instanceof CareOperationConflict)return json({error:error.message},409)
  const message=error instanceof Error&&!error.name.startsWith('Prisma')?error.message:'Could not confirm care. Retry the same selection safely.'
  return json({error:message},400)
 }
}
