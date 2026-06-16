import Link from 'next/link'
import { CollectionExhibitAccessMode } from '@prisma/client'
import { createCollectionExhibit } from '@/app/exhibit-actions'
import { CopyPublicUrlButton } from '@/components/exhibits/CopyPublicUrlButton'
import { AddPanel, Button, Card, Field, LinkButton, Select, TextArea } from '@/components/ui'
import { canManageCollection, collectionPath, requireCollectionGardener } from '@/lib/collections'
import { publicExhibitPath } from '@/lib/exhibits'
import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/time'

export default async function CollectionExhibitsPage() {
  const context = await requireCollectionGardener()
  const canManage = canManageCollection(context.user, context)
  const exhibits = await prisma.collectionExhibit.findMany({
    where: { collectionId: context.collection.id },
    include: {
      _count: { select: { plants: true, subscribers: true, updates: true } },
      createdBy: { select: { email: true } },
      publishedBy: { select: { email: true } },
    },
    orderBy: [{ updatedAt: 'desc' }],
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Collection Exhibits</h2>
          <p className="text-sm text-stone-600">Curate read-only public or unlisted specimen showcases from selected collection plants.</p>
        </div>
        <LinkButton href={collectionPath(context.collection.slug, '/gallery')}>Review photos</LinkButton>
      </div>

      <AddPanel label="Create exhibit draft" defaultOpen={exhibits.length === 0}>
        <form action={createCollectionExhibit} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="collectionSlug" value={context.collection.slug} />
          <Field label="Title" name="title" required wrapperClassName="md:col-span-2" />
          <TextArea label="Short description" name="description" wrapperClassName="md:col-span-2" />
          <Select label="Access mode" name="accessMode" defaultValue={CollectionExhibitAccessMode.UNLISTED}>
            <option value="UNLISTED">Unlisted link</option>
            <option value="PUBLIC">Public</option>
          </Select>
          <Field label="Expires after" name="expiresAt" type="date" help="Optional. Published exhibits stop displaying after this date." />
          <TextArea label="Intro text" name="introMarkdown" wrapperClassName="md:col-span-2" help="Plain text or light Markdown." />
          <div className="md:col-span-2">
            <Button>Create draft</Button>
          </div>
        </form>
      </AddPanel>

      {exhibits.length === 0 ? (
        <Card className="py-10 text-center">
          <h3 className="font-serif text-2xl font-bold">No exhibits yet.</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600">Create a draft, choose specimens, then a collection manager can publish the share link.</p>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {exhibits.map((exhibit) => (
            <Card key={exhibit.id} className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f6b45]">{exhibit.status.toLowerCase()} · {exhibit.accessMode.toLowerCase()}</p>
                  <h3 className="font-serif text-2xl font-bold">
                    <Link className="hover:underline" href={collectionPath(context.collection.slug, `/exhibits/${exhibit.id}`)}>
                      {exhibit.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-stone-600">
                    {exhibit._count.plants} plants · {exhibit._count.subscribers} subscribers · updated {formatDateTime(exhibit.updatedAt)}
                  </p>
                  {exhibit.publishedAt && <p className="text-xs text-stone-500">Published {formatDateTime(exhibit.publishedAt)}{exhibit.publishedBy ? ` by ${exhibit.publishedBy.email}` : ''}</p>}
                </div>
                <Link href={collectionPath(context.collection.slug, `/exhibits/${exhibit.id}`)} className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 text-sm font-medium dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)]">
                  Edit
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {exhibit.status === 'PUBLISHED' && (
                  <Link className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 font-medium dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)]" href={publicExhibitPath(exhibit)}>
                    Public view
                  </Link>
                )}
                {exhibit.status === 'PUBLISHED' && <CopyPublicUrlButton path={publicExhibitPath(exhibit)} />}
                {canManage ? (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-[#2f6b45]/20 bg-[#e8efdf] px-3 py-1.5 text-xs font-semibold text-[#2f6b45] dark:bg-[#2f6b45]/20 dark:text-[#b9d6a4]">Can publish</span>
                ) : (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-stone-200 bg-white/60 px-3 py-1.5 text-xs text-stone-600 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)] dark:text-[color:var(--ax-text-muted)]">Draft editor</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
