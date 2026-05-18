'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { MobileMenuAutoClose } from './MobileMenuAutoClose'
import { Button, GhostLink } from './ui'
import {
  Archive,
  BarChart3,
  Bell,
  BookOpen,
  Eye,
  FileText,
  Flower2,
  GitBranch,
  Home,
  Images,
  Leaf,
  FlaskConical,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sprout,
  Tag,
  Users,
} from 'lucide-react'
import { collectionRoleAtLeast, collectionRoleLabel, isServerAdminRole } from '@/lib/roles'

export type SidebarCollection = {
  id: string
  name: string
  slug: string
  visibility: string
  membership: {
    role: string
    status: string
  } | null
}

type SidebarUser = {
  email: string
  role: string
}

const navSections = [
  {
    label: 'Home',
    items: [
      ['/', 'Dashboard', Home],
      ['/search', 'Search', Search],
    ],
  },
  {
    label: 'Collection',
    items: [
      ['/plants', 'Plant Definitions', Leaf],
      ['/instances', 'Plant Instances', Sprout],
      ['/propagations', 'Propagations', GitBranch],
      ['/blooms', 'Bloom Tracker', Flower2],
    ],
  },
  {
    label: 'Review',
    items: [
      ['/gallery', 'Gallery', Images],
      ['/reminders', 'Reminders', Bell],
      ['/following', 'Following', Eye],
      ['/sports', 'Sport Review', ShieldCheck],
      ['/graphs', 'Lineage Graphs', BarChart3],
      ['/labels', 'Bulk Tags', Tag],
      ['/archived', 'Archived Plants', Archive],
    ],
  },
] as const

const collectionAdminItems = [
  ['/collection-settings', 'Collection Settings', Settings, 'MANAGER'],
  ['/members', 'Collection Members', Users, 'MANAGER'],
  ['/settings', 'Governing Bodies', Settings, 'GARDENER'],
  ['/admin-tools', 'Collection Tools', FlaskConical, 'GARDENER'],
  ['/audit', 'Audit Log', FileText, 'GARDENER'],
] as const

function collectionPath(slug: string, path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (normalized === '/') return `/c/${slug}`
  return `/c/${slug}${normalized}`
}

function slugFromPathname(pathname: string) {
  const match = pathname.match(/^\/c\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

function activeRole(collection: SidebarCollection | undefined) {
  if (collection?.membership?.status !== 'ACTIVE') return null
  return collection.membership.role
}

export function SidebarClient({
  user,
  initialCollection,
  collections,
  logoutAction,
}: {
  user: SidebarUser | null
  initialCollection: { name: string; slug: string }
  collections: SidebarCollection[]
  logoutAction: () => Promise<void>
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pathSlug = slugFromPathname(pathname)
  const querySlug = searchParams.get('collection')
  const slug = pathSlug || querySlug || initialCollection.slug
  const currentCollection = collections.find((collection) => collection.slug === slug)
  const currentName = currentCollection?.name || (initialCollection.slug === slug ? initialCollection.name : slug)
  const role = activeRole(currentCollection)
  const isSiteAdmin = isServerAdminRole(user?.role)
  const collectionAdminItemsForRole = collectionAdminItems.filter(([, , , minimumRole]) => isSiteAdmin || (role && collectionRoleAtLeast(role, minimumRole)))
  const globalPath = (href: string) => `${href}?collection=${encodeURIComponent(slug)}`

  const nav = (
    <nav className="grid gap-4">
      {navSections.map((section) => (
        <div key={section.label} className="grid gap-1">
          <p className="px-3 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-stone-500">{section.label}</p>
          {section.items.map(([href, label, Icon]) => (
            <GhostLink key={href} href={collectionPath(slug, href)}>
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </GhostLink>
          ))}
        </div>
      ))}
      {(collectionAdminItemsForRole.length > 0 || isSiteAdmin) && (
        <div className="grid gap-1 border-t border-stone-200 pt-4">
          <p className="px-3 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-stone-500">Admin</p>
          {collectionAdminItemsForRole.map(([href, label, Icon]) => (
            <GhostLink key={href} href={collectionPath(slug, href)}>
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </GhostLink>
          ))}
          {isSiteAdmin && (
            <GhostLink href="/server">
              <FlaskConical className="h-4 w-4 shrink-0" />
              <span>Server Management</span>
            </GhostLink>
          )}
        </div>
      )}
    </nav>
  )

  const account = user ? (
    <div className="grid gap-2">
      <div>
        <p className="truncate font-medium">{user.email}</p>
        <p className="text-stone-600">{isServerAdminRole(user.role) ? 'server admin' : role ? collectionRoleLabel(role) : 'user'}</p>
      </div>
      <GhostLink href={globalPath('/account')}>
        <BookOpen className="h-4 w-4 shrink-0" />
        <span>Account</span>
      </GhostLink>
      <form action={logoutAction}>
        <Button className="w-full">Sign out</Button>
      </form>
    </div>
  ) : (
    <GhostLink href="/login">
      <BookOpen className="h-4 w-4 shrink-0" />
      <span>Sign in</span>
    </GhostLink>
  )

  const collectionSwitcher = (
    <details className="mb-5 rounded-lg border border-stone-200 bg-white/45 p-2 text-sm">
      <summary className="cursor-pointer list-none font-medium text-stone-800">{currentName}</summary>
      <div className="mt-2 grid gap-1">
        {collections.map((collection) => (
          <a
            key={collection.id}
            href={collectionPath(collection.slug)}
            className="rounded-md px-2 py-1 text-stone-700 hover:bg-[#d6dfc9]/60"
          >
            {collection.name}
          </a>
        ))}
        <Link href={globalPath('/collections')} className="rounded-md px-2 py-1 text-[#2f6b45] hover:bg-[#d6dfc9]/60">
          Manage collections
        </Link>
      </div>
    </details>
  )

  return (
    <>
      <header className="no-print sticky top-0 z-40 border-b border-stone-200/80 bg-[#fffaf0]/95 px-4 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href={collectionPath(slug)} className="flex items-center gap-2 rounded-md outline-none transition hover:text-[#1f472f] focus:ring-2 focus:ring-[#8fa58f]/30">
            <img src="/axildb-logo.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
            <div>
              <h1 className="font-serif text-xl font-semibold leading-none">AxilDB</h1>
              <p className="text-xs text-stone-600">Botanical Accession</p>
            </div>
          </Link>
          <details className="relative" data-mobile-menu>
            <MobileMenuAutoClose />
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-stone-200 bg-white/80 shadow-sm">
              <Menu className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 mt-2 max-h-[80vh] w-[min(21rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-stone-200 bg-[#fffaf0] p-3 shadow-xl">
              {collectionSwitcher}
              {nav}
              <div className="mt-4 border-t border-stone-200 pt-4 text-sm">{account}</div>
            </div>
          </details>
        </div>
      </header>

      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-stone-200/80 bg-[#fffaf0]/85 p-4 shadow-sm backdrop-blur md:flex">
        <Link href={collectionPath(slug)} className="mb-3 flex items-center gap-3 rounded-md outline-none transition hover:text-[#1f472f] focus:ring-2 focus:ring-[#8fa58f]/30">
          <img src="/axildb-logo.png" alt="" className="h-11 w-11 shrink-0 object-contain" />
          <div>
            <h1 className="font-serif text-2xl font-semibold leading-none">AxilDB</h1>
            <p className="text-xs text-stone-600">Botanical Accession</p>
          </div>
        </Link>
        {collectionSwitcher}
        <div className="min-h-0 flex-1 overflow-auto">{nav}</div>
        <div className="mt-6 border-t border-stone-200 pt-4 text-sm">{account}</div>
      </aside>
    </>
  )
}
