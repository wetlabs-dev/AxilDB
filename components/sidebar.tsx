import { logout } from '@/app/auth-actions'
import { getCurrentUser, isAdmin } from '@/lib/auth'
import Link from 'next/link'
import { MobileMenuAutoClose } from './MobileMenuAutoClose'
import { Button, GhostLink } from './ui'
import {
  Archive,
  BarChart3,
  BookOpen,
  FileText,
  Flower2,
  GitBranch,
  Home,
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

const baseItems = [
  ['/', 'Dashboard', Home],
  ['/plants', 'Plant Definitions', Leaf],
  ['/instances', 'Plant Instances', Sprout],
  ['/propagations', 'Propagations', GitBranch],
  ['/blooms', 'Bloom Tracker', Flower2],
  ['/graphs', 'Lineage Graphs', BarChart3],
  ['/sports', 'Sport Review', ShieldCheck],
  ['/labels', 'Bulk Tags', Tag],
  ['/search', 'Search', Search],
  ['/archived', 'Archived Plants', Archive],
] as const

const adminItems = [
  ['/settings', 'Governing Bodies', Settings],
  ['/admin-tools', 'Admin Tools', FlaskConical],
  ['/audit', 'Audit Log', FileText],
  ['/users', 'Users', Users],
] as const

export async function Sidebar() {
  const user = await getCurrentUser()
  const items = isAdmin(user) ? [...baseItems, ...adminItems] : baseItems

  const nav = (
    <nav className="grid gap-1">
      {items.map(([href, label, Icon]) => (
        <GhostLink key={href} href={href}>
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </GhostLink>
      ))}
    </nav>
  )

  const account = user ? (
    <div className="grid gap-2">
      <div>
        <p className="truncate font-medium">{user.email}</p>
        <p className="text-stone-600">{user.role.toLowerCase()}</p>
      </div>
      <GhostLink href="/account">
        <BookOpen className="h-4 w-4 shrink-0" />
        <span>Account</span>
      </GhostLink>
      <form action={logout}>
        <Button className="w-full">Sign out</Button>
      </form>
    </div>
  ) : (
    <GhostLink href="/login">
      <BookOpen className="h-4 w-4 shrink-0" />
      <span>Sign in</span>
    </GhostLink>
  )

  return (
    <>
      <header className="no-print sticky top-0 z-40 border-b border-stone-200/80 bg-[#fffaf0]/95 px-4 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 rounded-md outline-none transition hover:text-[#1f472f] focus:ring-2 focus:ring-[#8fa58f]/30">
            <img src="/axildb-logo.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
            <div>
              <h1 className="font-serif text-xl font-semibold leading-none">AxilDB</h1>
              <p className="text-xs text-stone-600">Plant Lineage</p>
            </div>
          </Link>
          <details className="relative" data-mobile-menu>
            <MobileMenuAutoClose />
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-stone-200 bg-white/80 shadow-sm">
              <Menu className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 mt-2 max-h-[80vh] w-[min(21rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-stone-200 bg-[#fffaf0] p-3 shadow-xl">
              {nav}
              <div className="mt-4 border-t border-stone-200 pt-4 text-sm">{account}</div>
            </div>
          </details>
        </div>
      </header>

      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-stone-200/80 bg-[#fffaf0]/85 p-4 shadow-sm backdrop-blur md:flex">
        <Link href="/" className="mb-7 flex items-center gap-3 rounded-md outline-none transition hover:text-[#1f472f] focus:ring-2 focus:ring-[#8fa58f]/30">
          <img src="/axildb-logo.png" alt="" className="h-11 w-11 shrink-0 object-contain" />
          <div>
            <h1 className="font-serif text-2xl font-semibold leading-none">AxilDB</h1>
            <p className="text-xs text-stone-600">Plant Lineage</p>
          </div>
        </Link>
        <div className="min-h-0 flex-1 overflow-auto">{nav}</div>
        <div className="mt-6 border-t border-stone-200 pt-4 text-sm">{account}</div>
      </aside>
    </>
  )
}
