'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MobileMenuAutoClose } from './MobileMenuAutoClose'
import { ThemeToggle } from './ThemeToggle'
import { Button, GhostLink } from './ui'
import {
  Archive,
  ArrowRightLeft,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  GalleryHorizontalEnd,
  Flower2,
  GitBranch,
  Home,
  Images,
  Leaf,
  FlaskConical,
  MapPinned,
  Menu,
  Search,
  Settings,
  ShoppingBag,
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

export type SidebarBadges = Record<string, number | undefined>

const navSections = [
  {
    label: 'Home',
    items: [
      ['/', 'Dashboard', Home],
      ['/search', 'Search', Search],
      ['/care', 'Care Queue', ClipboardCheck],
      ['/workflows', 'Workflows', ClipboardList],
      ['/care-sheets', 'Care Sheets', BookOpen],
    ],
  },
  {
    label: 'Collection',
    items: [
      ['/plants', 'Plant Definitions', Leaf],
      ['/wishlist', 'Wishlist', ClipboardList],
      ['/acquisitions', 'Acquisitions', ShoppingBag],
      ['/instances', 'Plant Instances', Sprout],
      ['/locations', 'Locations', MapPinned],
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
  ['/fertilizers', 'Fertilizers', FlaskConical, 'GARDENER'],
  ['/treatments', 'Treatments', ShieldCheck, 'GARDENER'],
  ['/plant-tags', 'Plant Tags', Tag, 'GARDENER'],
  ['/provenance', 'Sources & Distributors', ShoppingBag, 'GARDENER'],
  ['/exhibits', 'Collection Exhibits', GalleryHorizontalEnd, 'GARDENER'],
  ['/transfers', 'Collection Transfers', ArrowRightLeft, 'GARDENER'],
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

function CountBadge({ value, attention = false }: { value?: number; attention?: boolean }) {
  if (!value || value < 1) return null
  const label = value > 999 ? '999+' : String(value)
  return (
    <span
      className={[
        'ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full border px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none',
        attention
          ? 'border-[#c47a5a]/35 bg-[#fff0de] text-[#7d3b23]'
          : 'border-[#8fa58f]/35 bg-[#e8efdf] text-[#2f6b45]',
      ].join(' ')}
      aria-label={`${label} items`}
    >
      {label}
    </span>
  )
}

export function SidebarClient({
  user,
  initialCollection,
  collections,
  badges = {},
  logoutAction,
}: {
  user: SidebarUser | null
  initialCollection: { name: string; slug: string }
  collections: SidebarCollection[]
  badges?: SidebarBadges
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
  const [accountExpanded, setAccountExpanded] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('axildb-sidebar-account-expanded')
    if (stored === 'false') setAccountExpanded(false)
  }, [])

  function toggleAccountExpanded() {
    setAccountExpanded((expanded) => {
      const next = !expanded
      localStorage.setItem('axildb-sidebar-account-expanded', String(next))
      return next
    })
  }

  const badgeFor = (key: string) => badges[key] || 0

  const nav = (
    <nav className="grid gap-4">
      {navSections.map((section) => (
        <div key={section.label} className="grid gap-1">
          <p className="px-3 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-stone-500">{section.label}</p>
          {section.items.map(([href, label, Icon]) => (
            <GhostLink key={href} href={collectionPath(slug, href)}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <CountBadge value={badgeFor(href)} attention={href === '/care'} />
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
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <CountBadge value={badgeFor(href)} attention={href === '/transfers' || href === '/members'} />
            </GhostLink>
          ))}
          {isSiteAdmin && (
            <GhostLink href="/server">
              <FlaskConical className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Server Management</span>
              <CountBadge value={badgeFor('server')} attention />
            </GhostLink>
          )}
        </div>
      )}
    </nav>
  )

  const account = user ? (
    <div className="grid gap-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{user.email}</p>
          <p className="text-stone-600">{isServerAdminRole(user.role) ? 'server admin' : role ? collectionRoleLabel(role) : 'user'}</p>
        </div>
        <button
          type="button"
          aria-expanded={accountExpanded}
          aria-label={accountExpanded ? 'Collapse account utilities' : 'Expand account utilities'}
          onClick={toggleAccountExpanded}
          className="account-utility-toggle inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white/45 text-stone-700 shadow-sm transition hover:bg-[#d6dfc9]/60 hover:text-[#1f472f] focus:outline-none focus:ring-2 focus:ring-[#8fa58f]/30"
        >
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${accountExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out ${accountExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        aria-hidden={!accountExpanded}
        inert={accountExpanded ? undefined : true}
      >
        <div className="grid min-h-0 gap-2">
          <GhostLink href={globalPath('/help')}>
            <CircleHelp className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Help</span>
          </GhostLink>
          <GhostLink href={globalPath('/account')}>
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Account</span>
            <CountBadge value={badgeFor('account')} attention />
          </GhostLink>
          <GhostLink href={globalPath('/privacy')}>
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Privacy</span>
          </GhostLink>
          <GhostLink href={globalPath('/terms')}>
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Terms</span>
          </GhostLink>
          <ThemeToggle />
        </div>
      </div>
      <form action={logoutAction}>
        <Button className="w-full">Sign out</Button>
      </form>
    </div>
  ) : (
    <div className="grid gap-2">
      <GhostLink href={globalPath('/help')}>
        <CircleHelp className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Help</span>
      </GhostLink>
      <GhostLink href="/login">
        <BookOpen className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Sign in</span>
      </GhostLink>
      <GhostLink href={globalPath('/privacy')}>
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Privacy</span>
      </GhostLink>
      <GhostLink href={globalPath('/terms')}>
        <FileText className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Terms</span>
      </GhostLink>
      <ThemeToggle />
    </div>
  )

  const collectionSwitcher = (
    <details className="mb-5 rounded-lg border border-stone-200 bg-white/45 p-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 py-1 text-stone-800 transition hover:bg-[#d6dfc9]/50">
        <span className="min-w-0">
          <span className="block font-medium">Collections</span>
          <span className="block truncate text-xs text-stone-600">Active: {currentName}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-500" />
      </summary>
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
