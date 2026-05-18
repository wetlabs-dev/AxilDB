import Link from 'next/link'
import { requestMembership } from '@/app/collection-actions'
import { Button, Card, LinkButton } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath, publicCollectionsForUser } from '@/lib/collections'
import { isServerAdminRole } from '@/lib/roles'

export default async function CollectionsPage() {
  const user = await getCurrentUser()
  const collections = await publicCollectionsForUser(user)
  const canCreateCollections = isServerAdminRole(user?.role)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Collections</h2>
          <p className="mt-1 text-sm text-stone-600">Choose a collection workspace or create a new one.</p>
        </div>
        {canCreateCollections && <LinkButton href="/server/collections/new">New collection</LinkButton>}
      </div>

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
