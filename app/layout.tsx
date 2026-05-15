import './globals.css'
import { Sidebar } from '@/components/sidebar'
import { headers } from 'next/headers'

export const metadata = {
  title: 'AxilDB — Plant Lineage Tracker',
  description: 'Personal horticultural accession database and plant lineage tracker.',
}

export default async function RootLayout({children}:{children:React.ReactNode}) {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')?.split(':')[0] || ''
  const isMarketingHost = host === 'axildb.com' || host === 'www.axildb.com'
  const isMarketingRoute = requestHeaders.get('x-axildb-marketing') === '1'

  return (
    <html lang="en">
      <body>
        {isMarketingHost || isMarketingRoute ? (
          children
        ) : (
          <div className="min-h-screen md:flex">
            <Sidebar />
            <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        )}
      </body>
    </html>
  )
}
