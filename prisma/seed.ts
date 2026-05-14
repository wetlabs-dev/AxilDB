import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
const prisma = new PrismaClient()
function hashPassword(password:string){ const salt=randomBytes(16).toString('hex'); const hash=scryptSync(password,salt,64).toString('hex'); return `${salt}:${hash}` }
async function main(){
 await prisma.auditLog.deleteMany(); await prisma.session.deleteMany(); await prisma.sportStabilityRecord.deleteMany(); await prisma.propagationChild.deleteMany(); await prisma.parentageLink.deleteMany(); await prisma.propagationEvent.deleteMany(); await prisma.bloomEvent.deleteMany(); await prisma.note.deleteMany(); await prisma.photo.deleteMany(); await prisma.plantInstance.deleteMany(); await prisma.plantDefinition.deleteMany(); await prisma.governingBody.deleteMany(); await prisma.user.deleteMany();
 await prisma.user.create({data:{email:'axildb@damonius.com',passwordHash:hashPassword('password'),role:'ADMIN'}})
 const avsa=await prisma.governingBody.create({data:{name:'African Violet Society of America',abbreviation:'AVSA',website:'https://africanvioletsocietyofamerica.org'}})
 const chimera=await prisma.plantDefinition.create({data:{genus:'Saintpaulia',species:'ionantha',cultivarName:'Demo Starfall',cultivarRegistrationNumber:'DEMO-001',governingBodyId:avsa.id,description:'Demo cultivar for seeded development data.'}})
 const mother=await prisma.plantInstance.create({data:{plantDefinitionId:chimera.id,plantId:'AV-001',instanceType:'MOTHER',location:'Plant shelf A',acquisitionDate:new Date('2026-04-12'),source:'Demo Nursery',distributor:'Local plant sale',stockNumber:'DN-42',purchasePrice:'18.00'}})
 const event=await prisma.propagationEvent.create({data:{method:'LEAF',date:new Date('2026-05-01'),successStatus:'SUCCESS',notes:'One leaf pull, two viable plantlets.',parents:{create:{parentPlantInstanceId:mother.id,parentRole:'SOURCE_PARENT'}}}})
 const child1=await prisma.plantInstance.create({data:{plantDefinitionId:chimera.id,plantId:'AV-001-P1',instanceType:'PROPAGATION',location:'Propagation tray',propagationDate:new Date('2026-05-01')}})
 const child2=await prisma.plantInstance.create({data:{plantDefinitionId:chimera.id,plantId:'AV-001-P2',instanceType:'PROPAGATION',location:'Propagation tray',propagationDate:new Date('2026-05-01'),isSportCandidate:true,sportStatus:'SUSPECTED',sportDescription:'Variegation appears stronger than mother.'}})
 await prisma.propagationChild.createMany({data:[{propagationEventId:event.id,childPlantInstanceId:child1.id},{propagationEventId:event.id,childPlantInstanceId:child2.id}]})
 const e2=await prisma.propagationEvent.create({data:{method:'LEAF',date:new Date('2026-05-20'),successStatus:'SUCCESS',parents:{create:{parentPlantInstanceId:child2.id,parentRole:'SOURCE_PARENT'}}}})
 const sportChild=await prisma.plantInstance.create({data:{plantDefinitionId:chimera.id,plantId:'AV-001-P2-A',instanceType:'PROPAGATION',location:'Sport tray',propagationDate:new Date('2026-05-20'),isSportCandidate:true,sportStatus:'CANDIDATE',sportDescription:'Sport descendant showing same variegation.'}})
 await prisma.propagationChild.create({data:{propagationEventId:e2.id,childPlantInstanceId:sportChild.id}})
 await prisma.sportStabilityRecord.create({data:{plantInstanceId:sportChild.id,propagationEventId:e2.id,propagatedTrue:true,generationNumber:3,notes:'Demo record: third true sport propagation.'}})
 await prisma.bloomEvent.create({data:{plantInstanceId:mother.id,bloomStartDate:new Date('2026-05-10'),peakBloomDate:new Date('2026-05-14'),flowerCount:7,firstBloom:false,notes:'Strong bloom cycle.'}})
 await prisma.note.create({data:{entityType:'PLANT_INSTANCE',entityId:mother.id,note:'Healthy mother specimen. Good candidate for continued leaf propagation.'}})
}
main().finally(()=>prisma.$disconnect())
