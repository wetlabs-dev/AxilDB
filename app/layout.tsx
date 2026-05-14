import './globals.css'
import { Sidebar } from '@/components/sidebar'

export const metadata = {
  title: 'AxilDB — Plant Lineage Tracker',
  description: 'Personal horticultural accession database and plant lineage tracker.',
}

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang='en'><body><div className='flex min-h-screen'><Sidebar/><main className='flex-1 p-8'>{children}</main></div></body></html>}
