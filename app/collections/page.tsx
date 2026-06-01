import Link from 'next/link'
import { requestCollection, requestMembership } from '@/app/collection-actions'
import { AddPanel, Button, Card, Field, LinkButton, Select, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath, publicCollectionsForUser } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { isServerAdminRole } from '@/lib/roles'
import { formatDate } from '@/lib/time'

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ collectionRequest?: string }>
}) {
  const user = await getCurrentUser()
  const sp = await searchParams
  const collections = await publicCollectionsForUser(user)
  const canCreateCollections = isServerAdminRole(user?.role)
  const myRequests = user
    ? await prisma.collectionRequest.findMany({
        where: { requestedById: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { collection: { select: { slug: true } } },
      })
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Collections</h2>
          <p className="mt-1 text-sm text-stone-600">Choose a collection workspace or create a new one.</p>
        </div>
        {canCreateCollections && <LinkButton href="/server/collections/new">New collection</LinkButton>}
      </div>

      {sp.collectionRequest === 'requested' && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Collection request submitted. A server admin will review it.</p>}
      {sp.collectionRequest === 'already-pending' && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">You already have a pending request for that collection slug.</p>}

      {user ? (
        <AddPanel label="Request a new collection">
          <form action={requestCollection} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Collection name" name="name" required />
              <Field label="Preferred slug" name="slug" help="Used in the collection URL. AxilDB will normalize it and keep it unique." />
              <Select label="Visibility" name="visibility" defaultValue="PRIVATE">
                <option value="PRIVATE">Private</option>
                <option value="PUBLIC">Public</option>
              </Select>
            </div>
            <TextArea label="Description" name="description" />
            <TextArea label="Why are you requesting this collection?" name="rationale" help="A short note for the server admin reviewing the request." />
            <Button className="w-fit">Submit collection request</Button>
          </form>
        </AddPanel>
      ) : (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Want your own collection?</h3>
          <p className="mt-2 text-sm text-stone-600">Create a viewer account first, then you can request a collection for server admin approval.</p>
          <LinkButton href="/register" className="mt-3">Register</LinkButton>
        </Card>
      )}

      {myRequests.length > 0 && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Your collection requests</h3>
          <div className="mt-3 grid gap-2">
            {myRequests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white/50 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{request.requestedName}</p>
                  <p className="text-xs text-stone-500">/{request.requestedSlug} · {request.visibility.toLowerCase()} · requested {formatDate(request.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-stone-200 bg-white px-2 py-1 text-xs">{request.status.toLowerCase()}</span>
                  {request.collection?.slug && <Link className="text-sm underline" href={collectionPath(request.collection.slug)}>Open</Link>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {collections.map((collection: any) => {
          const membership = collection.memberships?.[0]
          const canOpen = collection.visibility === 'PUBLIC' || membership?.status === 'ACTIVE'
          return (
            <Card key={collection.id} className="flex flex-col gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-serif text-xl font-semibold">{collection.name}</h3>
                  <span className="rounded-full border border-stone-200 bg-white/70 px-2 py-1 text-xs">{collection.visibility.toLowerCase()}</span>
                </div>
                <p className="mt-2 text-sm text-stone-600">{collection.description || 'No description yet.'}</p>
                {membership && <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[#2f6b45]">{membership.status} · {membership.role}</p>}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {canOpen && <LinkButton href={collectionPath(collection.slug)} className="px-3 py-1.5">Open</LinkButton>}
                {user && !membership && (
                  <form action={requestMembership}>
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <Button className="px-3 py-1.5">Request access</Button>
                  </form>
                )}
                {!user && collection.visibility === 'PRIVATE' && <Link className="text-sm underline" href="/login">Sign in to request access</Link>}
              </div>
            </Card>
          )
        })}
        {collections.length === 0 && <Card>No public collections yet.</Card>}
      </div>
    </div>
  )
}
