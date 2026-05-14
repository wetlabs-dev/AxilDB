import { logout } from '@/app/auth-actions'
import { getCurrentUser, isAdmin } from '@/lib/auth'
import { GhostLink, Button } from './ui'

export async function Sidebar(){
 const user=await getCurrentUser()
 const items=[['/','Dashboard'],['/plants','Plants'],['/instances','Mother Plants'],['/propagations','Propagations'],['/blooms','Bloom Tracker'],['/graphs','Lineage Graphs'],['/sports','Sport Review'],['/labels','Bulk Tags'],['/search','Search'],['/archived','Archived Plants']]
 const adminItems=isAdmin(user)?[['/settings','Governing Bodies'],['/audit','Audit Log'],['/users','Users']]:[]
 return <aside className='no-print sticky top-0 h-screen w-64 border-r bg-white/70 p-4'><h1 className='mb-6 text-xl font-bold'>AxilDB</h1><nav className='grid gap-1'>{[...items,...adminItems].map(([href,label])=><GhostLink key={href} href={href}>{label}</GhostLink>)}</nav><div className='mt-6 border-t pt-4 text-sm'>{user ? <div className='grid gap-2'><div><p className='font-medium'>{user.email}</p><p className='text-stone-600'>{user.role.toLowerCase()}</p></div><GhostLink href='/account'>Account</GhostLink><form action={logout}><Button className='w-full'>Sign out</Button></form></div> : <GhostLink href='/login'>Sign in</GhostLink>}</div></aside>
}
