import {PrismaClient} from '@prisma/client'
import {createHash,createCipheriv,randomBytes}from'node:crypto'
import{readFile,writeFile}from'node:fs/promises'
const target=new URL(process.env.DATABASE_URL||'');if(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='55441'||target.pathname!=='/axildb_dark_audit')throw Error('Audit database only')
const db=new PrismaClient(),c=JSON.parse(await readFile('/tmp/axildb-dark-audit-context.json','utf8'))
try{
 const iv=randomBytes(12),key=createHash('sha256').update(process.env.TOTP_ENCRYPTION_KEY||process.env.AUTH_SECRET||'axildb-development-totp-key').digest(),cipher=createCipheriv('aes-256-gcm',key,iv)
 const encrypted=Buffer.concat([cipher.update('JBSWY3DPEHPK3PXP'),cipher.final()]),payload=[iv,cipher.getAuthTag(),encrypted].map(v=>v.toString('base64url')).join('.')
 await db.userTwoFactor.update({where:{userId:c.userId},data:{secretCiphertext:payload}})
 await db.domainEvent.update({where:{id:c.event},data:{visibility:'COLLECTION_MEMBER'}})
 const validated=await db.plantDefinition.create({data:{genus:'Fictional',species:'reference',isValidated:true,collectionId:null,description:'Synthetic globally validated reference; not botanical advice.'}});c.validated=validated.id
 c.challengeToken=randomBytes(32).toString('hex');await db.twoFactorChallenge.create({data:{userId:c.userId,tokenHash:createHash('sha256').update(c.challengeToken).digest('hex'),expiresAt:new Date(Date.now()+3600000)}})
 await writeFile('/tmp/axildb-dark-audit-context.json',JSON.stringify(c))
 console.log('Fixture-only account, event visibility and reference data corrected.')
}finally{await db.$disconnect()}
