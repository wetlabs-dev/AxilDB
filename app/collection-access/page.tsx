import Link from 'next/link'
import { requestMembership } from '@/app/collection-actions'
import { Button, Card, LinkButton } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

export default async function CollectionAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const sp = await searchParams
  const slug = String(sp.slug || '').trim()
  const user = await getCurrentUser()

  const collection = slug
    ? await prisma.collection.findUnique({
        where: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          description: true,
          memberships: user
            ? {
                where: { userId: user.id },
                select: { status: true, role: true },
                take: 1,
              }
            : false,
        },
      })
    : null

  if (!collection) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h2 className="text-3xl font-bold">Collection Not Found</h2>
        <Card>
          <p className="text-stone-700">That collection could not be found. It may have been renamed, made private, or removed.</p>
          <div className="mt-4">
            <LinkButton href="/collections">Browse collections</LinkButton>
          </div>
        </Card>
      </div>
    )
  }

  const membership = collection.memberships?.[0]
  if (collection.visibility === 'PUBLIC' || membership?.status === 'ACTIVE') {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h2 className="text-3xl font-bold">Access Available</h2>
        <Card>
          <p className="text-stone-700">You can open {collection.name} now.</p>
          <div className="mt-4">
            <LinkButton href={collectionPath(collection.slug)}>Open collection</LinkButton>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h2 className="text-3xl font-bold">Private Collection</h2>
        <p className="mt-1 text-sm text-stone-600">Membership is required before you can browse this collection.</p>
      </div>

      <Card>
        <h3 className="font-serif text-xl font-semibold">{collection.name}</h3>
        {collection.description && <p className="mt-2 text-sm text-stone-600">{collection.description}</p>}

        {!user && (
          <p className="mt-4 text-sm text-stone-700">
            <Link className="text-[#2f6b45] underline" href="/login">Sign in</Link> to request access.
          </p>
        )}

        {user && membership?.status === 'PENDING' && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Your membership request is pending collection manager approval.
          </p>
        )}

        {user && membership?.status === 'REJECTED' && (
          <p className="mt-4 rounded-lg border border-stone-200 bg-white/70 p-3 text-sm text-stone-700">
            Your previous membership request was not approved. Contact a collection manager if you think this should change.
          </p>
        )}

        {user && !membership && (
          <form action={requestMembership} className="mt-4">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <Button>Request access</Button>
          </form>
        )}

        <div className="mt-4">
          <Link className="text-sm text-[#2f6b45] underline" href="/collections">Back to collections</Link>
        </div>
      </Card>
    </div>
  )
}
