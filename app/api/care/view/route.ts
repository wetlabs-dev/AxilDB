import {NextRequest,NextResponse} from 'next/server'
import {isRedirectError} from 'next/dist/client/components/redirect-error'
import {getCurrentUser} from '@/lib/auth'
import {requireCollectionViewer} from '@/lib/collections'
import {validRequestOrigin} from '@/lib/request-origin'
import {prisma} from '@/lib/prisma'
import {readCareViewPreference,writeCareViewPreference} from '@/lib/care-view-preferences'
export const dynamic='force-dynamic'
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})
async function actor(slug:string){const user=await getCurrentUser();if(!user)throw new Error('Sign in to save a view.');const context=await requireCollectionViewer(slug);return {userId:user.id,collectionId:context.collection.id}}
export async function GET(req:NextRequest){try{const scope=await actor(req.nextUrl.searchParams.get('collectionSlug')||'');return json({preference:await readCareViewPreference(prisma,scope.userId,scope.collectionId)})}catch{return json({error:'Sign in and check collection access.'},403)}}
export async function POST(req:NextRequest){
 if(!validRequestOrigin(req))return json({error:'Invalid request origin.'},403)
 try{
  if(!(await getCurrentUser()))return json({error:'Sign in to save a view.'},401)
  const raw=await req.text();if(raw.length>4096)return json({error:'View request is too large.'},413)
  const input=JSON.parse(raw);if(typeof input.collectionSlug!=='string')return json({error:'Choose a collection.'},400)
  const scope=await actor(input.collectionSlug)
  return json({preference:await writeCareViewPreference(prisma,scope.userId,scope.collectionId,input)})
 }catch(error){if(isRedirectError(error)||error instanceof Error&&/permission/i.test(error.message))return json({error:'Collection access is required.'},403);return json({error:error instanceof Error&&!error.name.startsWith('Prisma')?error.message:'Unable to save view preferences.'},400)}
}
