import type { Prisma, PrismaClient } from '@prisma/client'
import {applyCareViewCommand,decodeCareView,type CareViewCommand} from '@/lib/care-view'
export const careViewSection=(collectionId:string)=>`care-queue:${collectionId}`
export async function readCareViewPreference(db: PrismaClient|Prisma.TransactionClient,userId:string|undefined,collectionId:string) {
  if(!userId)return decodeCareView()
  const row=await db.userSortPreference.findUnique({where:{userId_section:{userId,section:careViewSection(collectionId)}},select:{sortKey:true}})
  return decodeCareView(row?.sortKey)
}
/** Authenticated callers supply their own user and authorized collection, never request-body IDs. */
export async function writeCareViewPreference(db:PrismaClient,userId:string,collectionId:string,input:CareViewCommand) {
  return db.$transaction(async tx=>{
    const section=careViewSection(collectionId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`care-view:${userId}:${collectionId}`},0))`
    const current=await tx.userSortPreference.findUnique({where:{userId_section:{userId,section}}})
    const next=applyCareViewCommand(decodeCareView(current?.sortKey),input)
    if(input.action==='reset')await tx.userSortPreference.deleteMany({where:{userId,section}})
    else {
      const sortKey=JSON.stringify(next)
      if(current?.sortKey!==sortKey)await tx.userSortPreference.upsert({where:{userId_section:{userId,section}},create:{userId,section,sortKey},update:{sortKey}})
    }
    return next
  })
}
