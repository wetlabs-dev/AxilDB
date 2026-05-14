import { GhostLink } from './ui'
export function Sidebar(){
 const items=[['/','Dashboard'],['/plants','Plants'],['/instances','Mother Plants'],['/propagations','Propagations'],['/blooms','Bloom Tracker'],['/graphs','Lineage Graphs'],['/sports','Sport Review'],['/labels','Bulk Tags'],['/search','Search'],['/archived','Archived Plants'],['/settings','Settings']]
 return <aside className='no-print sticky top-0 h-screen w-64 border-r bg-white/70 p-4'><h1 className='mb-6 text-xl font-bold'>Plant Lineage</h1><nav className='grid gap-1'>{items.map(([href,label])=><GhostLink key={href} href={href}>{label}</GhostLink>)}</nav></aside>
}
