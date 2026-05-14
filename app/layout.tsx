import './globals.css'
import { Sidebar } from '@/components/sidebar'

export const metadata = {
  title: 'AxilDB — Plant Lineage Tracker',
  description: 'Personal horticultural accession database and plant lineage tracker.',
}

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang='en'><body><div className='min-h-screen md:flex'><Sidebar/><main className='min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8'>{children}</main></div></body></html>}
