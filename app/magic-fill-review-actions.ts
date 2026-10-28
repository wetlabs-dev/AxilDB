'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireCollectionAdmin, collectionPath } from '@/lib/collections'
import { audit } from '@/lib/auth'
import { approveCadenceProposal, magicFillReplacementBaseline } from '@/lib/cadence-research'

export async function approveMagicFillCadences(input: { collectionSlug: string; definitionId: string; selections: Array<{ id: string; replace: boolean }> }) {
  const { user, collection } = await requireCollectionAdmin(input.collectionSlug)
  if (!Array.isArray(input.selections) || !input.selections.length || input.selections.length > 6 || input.selections.some(p => typeof p.id !== 'string' || p.id.length > 200 || typeof p.replace !== 'boolean')) throw new Error('Select up to six valid cadence recommendations.')
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: input.definitionId, collectionId: collection.id } })
  const results: Array<{ id: string; result: string }> = []
  for (const selection of input.selections) {
    const p = await prisma.careCadenceProposal.findFirst({ where: { id: selection.id, plantDefinitionId: input.definitionId, plantDefinition: { collectionId: collection.id } } })
    if (!p) { results.push({ id: selection.id, result: 'Recommendation unavailable' }); continue }
    if (p.status === 'APPROVED') { results.push({ id: p.id, result: 'APPROVED' }); continue }
    const expected = magicFillReplacementBaseline(p.reviewNote)
    if (selection.replace && !expected) { results.push({ id: p.id, result: 'Replacement requires new research and review' }); continue }
    try { results.push({ id: p.id, result: await approveCadenceProposal(prisma, p.id, user.id, undefined, selection.replace ? { expected: expected! } : undefined) }) }
    catch { results.push({ id: p.id, result: 'Validation or persistence failed; check dependencies and retry' }) }
  }
  await audit(user, 'UPDATE', 'CARE_CADENCE_PROPOSAL', input.definitionId, 'Reviewed Magic Fill care cadence recommendations', { results }, collection.id)
  for (const suffix of ['', '/plants', '/care', '/care/checklist', '/instances', `/plants/${input.definitionId}`, `/plants/${input.definitionId}/edit`]) revalidatePath(collectionPath(collection.slug, suffix))
  revalidatePath('/server/care-cadence-research')
  const current = await prisma.plantDefinitionCareCadence.findMany({ where: { plantDefinitionId: input.definitionId } })
  return { results, current }
}
