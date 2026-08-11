import { deleteCareSheet, revokeCareSheet } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { CareSheetView } from '@/components/CareSheetView'
import { Button, Card } from '@/components/ui'
import { attachCareSheetPhotos, careSheetStatusLabel, publicCareSheetUrl, sitterUrl } from '@/lib/care-sheets'
import { canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

export default async function CareSheetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const context = await requireCollectionViewer()
  const sheet = await prisma.careSheet.findFirstOrThrow({
    where: { id, collectionId: context.collection.id },
    include: {
      collection: true,
      plants: {
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        include: {
          plantInstance: {
            include: {
              plantDefinition: { include: { aliases: true, taxonomicAuthority: true, husbandryGuide: true } },
              husbandryOverride: true,
            },
          },
        },
      },
      tasks: {
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: {
          plantInstance: {
            include: {
              plantDefinition: { include: { aliases: true, taxonomicAuthority: true, husbandryGuide: true } },
              husbandryOverride: true,
            },
          },
        },
      },
    },
  })
  const hydratedSheet = await attachCareSheetPhotos(prisma, sheet)
  const canManage = canManageCollection(context.user, context)
  const sharePath = query.token
    ? sheet.mode === 'SITTER_SESSION'
      ? sitterUrl(query.token)
      : publicCareSheetUrl(query.token)
    : null

  return (
    <div className="space-y-4">
      {sharePath && (
        <Card className="border-[#b9c8aa] bg-[#f5f8ed]">
          <p className="text-sm font-medium text-stone-800">Share link created:</p>
          <p className="mt-1 break-all text-sm text-[#2f6b45]">{sharePath}</p>
          <p className="mt-1 text-xs text-stone-600">Copy this path from your deployed app host. Status: {careSheetStatusLabel(sheet.status)}.</p>
        </Card>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {sheet.status === 'ACTIVE' && (
            <form action={revokeCareSheet}>
              <input type="hidden" name="collectionSlug" value={context.collection.slug} />
              <input type="hidden" name="id" value={sheet.id} />
              <input type="hidden" name="back" value={collectionPath(context.collection.slug, `/care-sheets/${sheet.id}`)} />
              <Button className="bg-[#9a3f35] hover:bg-[#7d3028]">Revoke share access</Button>
            </form>
          )}
          <form action={deleteCareSheet}>
            <input type="hidden" name="collectionSlug" value={context.collection.slug} />
            <input type="hidden" name="id" value={sheet.id} />
            <input type="hidden" name="back" value={collectionPath(context.collection.slug, '/care-sheets')} />
            <ConfirmDeleteButton
              title="Delete care sheet?"
              message={`This permanently removes "${sheet.title}" and its saved tasks. Plant records and care history will stay intact.`}
              confirmLabel="Delete care sheet"
            >
              Delete care sheet
            </ConfirmDeleteButton>
          </form>
        </div>
      )}

      <CareSheetView sheet={hydratedSheet} />
    </div>
  )
}
