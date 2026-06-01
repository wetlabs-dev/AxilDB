import Link from 'next/link'
import { deleteCareSheet, revokeCareSheet } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Button, Card, LinkButton } from '@/components/ui'
import { careSheetModeLabel, careSheetStatusLabel } from '@/lib/care-sheets'
import { canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { formatDate as formatLocalDate } from '@/lib/time'

function formatDate(date?: Date | null) {
  if (!date) return 'No expiration'
  return formatLocalDate(date)
}

export default async function CareSheetsPage() {
  const context = await requireCollectionViewer()
  const canManage = canManageCollection(context.user, context)
  const sheets = await prisma.careSheet.findMany({
    where: { collectionId: context.collection.id },
    include: { _count: { select: { plants: true, tasks: true } } },
    orderBy: [{ updatedAt: 'desc' }],
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Care Sheets</h2>
          <p className="text-sm text-stone-600">Build printable guides, weekly checklists, and limited plant-sitter links.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={collectionPath(context.collection.slug, '/care/checklist')}>Weekly checklist</LinkButton>
          <LinkButton href={collectionPath(context.collection.slug, '/care-sheets/new')}>New care sheet</LinkButton>
        </div>
      </div>

      {sheets.length === 0 ? (
        <Card className="py-10 text-center">
          <h3 className="font-serif text-2xl font-bold">No care sheets yet.</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600">Start with a few specimens, choose the care sections that matter, and AxilDB will turn your records into something printable or shareable.</p>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sheets.map((sheet) => (
            <Card key={sheet.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f6b45]">{careSheetModeLabel(sheet.mode)}</p>
                  <h3 className="font-serif text-2xl font-bold">
                    <Link className="hover:underline" href={collectionPath(context.collection.slug, `/care-sheets/${sheet.id}`)}>
                      {sheet.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-stone-600">{careSheetStatusLabel(sheet.status)} · {sheet._count.plants} plants · {sheet._count.tasks} tasks · expires {formatDate(sheet.expiresAt)}</p>
                </div>
                <Link href={collectionPath(context.collection.slug, `/care-sheets/${sheet.id}`)} className="rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 text-sm font-medium">
                  Open
                </Link>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  {sheet.status === 'ACTIVE' && (
                    <form action={revokeCareSheet}>
                      <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                      <input type="hidden" name="id" value={sheet.id} />
                      <input type="hidden" name="back" value={collectionPath(context.collection.slug, '/care-sheets')} />
                      <Button className="bg-[#9a3f35] hover:bg-[#7d3028]">Revoke</Button>
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
                      Delete
                    </ConfirmDeleteButton>
                  </form>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
