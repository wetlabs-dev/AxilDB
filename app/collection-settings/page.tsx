import { requestAiAccess } from '@/app/collection-actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { requireCollectionManager } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

export default async function CollectionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aiAccess?: string }>
}) {
  const { collection } = await requireCollectionManager()
  const sp = await searchParams
  const pendingAiRequest = await prisma.aiAccessRequest.findFirst({
    where: { collectionId: collection.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, rationale: true },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Collection Settings</h2>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Manage this collection&apos;s name, URL slug, description, and whether visitors can browse it without joining.
        </p>
      </div>

      <Card>
        <form action="/api/collections/update" method="post" className="grid max-w-4xl gap-x-3 gap-y-3 lg:grid-cols-3">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Field label="Name" name="name" defaultValue={collection.name} required />
          <Field label="Slug" name="slug" defaultValue={collection.slug} required />
          <Select label="Visibility" name="visibility" defaultValue={collection.visibility}>
            <option value="PRIVATE">Private</option>
            <option value="PUBLIC">Public</option>
          </Select>
          <TextArea label="Description" name="description" defaultValue={collection.description} wrapperClassName="lg:col-span-3" />
          <div className="lg:col-span-3">
            <Button>Save collection settings</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">AI features</h3>
            <p className="mt-1 text-sm text-stone-600">
              AI draft and Magic Fill tools are controlled by the server admin because they use metered API calls.
            </p>
          </div>
          <span className={collection.aiFeaturesEnabled ? 'rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-semibold text-green-900' : 'rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-sm font-semibold text-stone-700'}>
            {collection.aiFeaturesEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        {sp.aiAccess === 'requested' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">AI access request sent to the server admin.</p>}
        {sp.aiAccess === 'already-pending' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This collection already has a pending AI access request.</p>}
        {sp.aiAccess === 'already-enabled' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">AI features are already enabled for this collection.</p>}
        {!collection.aiFeaturesEnabled && (
          <div className="mt-4">
            {pendingAiRequest ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                AI access was requested on {pendingAiRequest.createdAt.toLocaleDateString()} and is awaiting server admin review.
              </p>
            ) : (
              <form action={requestAiAccess} className="grid max-w-2xl gap-3">
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <TextArea label="Why does this collection need AI features?" name="rationale" className="min-h-24" />
                <Button className="w-fit">Request AI access</Button>
              </form>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
