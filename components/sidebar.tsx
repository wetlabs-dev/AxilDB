import { logout } from '@/app/auth-actions'
import { getCurrentUser } from '@/lib/auth'
import { getCollectionContext, publicCollectionsForUser } from '@/lib/collections'
import { SidebarClient, type SidebarCollection } from './SidebarClient'

export async function Sidebar() {
  const user = await getCurrentUser()
  const context = await getCollectionContext()
  const collections = await publicCollectionsForUser(user)

  const sidebarCollections: SidebarCollection[] = collections.map((collection: any) => ({
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    visibility: collection.visibility,
    membership: collection.memberships?.[0]
      ? {
          role: collection.memberships[0].role,
          status: collection.memberships[0].status,
        }
      : null,
  }))

  return (
    <SidebarClient
      user={user ? { email: user.email, role: user.role } : null}
      initialCollection={{ name: context.collection.name, slug: context.collection.slug }}
      collections={sidebarCollections}
      logoutAction={logout}
    />
  )
}
