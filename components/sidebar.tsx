import { logout } from '@/app/auth-actions'
import { getCurrentUser, isAdmin } from '@/lib/auth'
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
          <div className="flex items-center gap-2">
            <Leaf className="h-6 w-6 text-[#2f6b45]" />
            <div>
              <h1 className="font-serif text-xl font-semibold leading-none">AxilDB</h1>
              <p className="text-xs text-stone-600">Plant Lineage</p>
            </div>
          </div>
          <details className="relative">
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
        <div className="mb-7 flex items-center gap-2">
          <Leaf className="h-7 w-7 text-[#2f6b45]" />
          <div>
            <h1 className="font-serif text-2xl font-semibold leading-none">AxilDB</h1>
            <p className="text-xs text-stone-600">Plant Lineage</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{nav}</div>
        <div className="mt-6 border-t border-stone-200 pt-4 text-sm">{account}</div>
      </aside>
    </>
  )
}
