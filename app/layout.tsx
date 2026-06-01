import './globals.css'
import { ScrollPreserver } from '@/components/ScrollPreserver'
import { Sidebar } from '@/components/sidebar'
import { headers } from 'next/headers'

export const metadata = {
  title: 'AxilDB — Botanical Accession System',
  description: 'Personal horticultural accession database for plant records, propagation history, and lineage tracking.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/app-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport = {
  themeColor: '#3f6212',
}

export default async function RootLayout({children}:{children:React.ReactNode}) {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')?.split(':')[0] || ''
  const isMarketingHost = host === 'axildb.com' || host === 'www.axildb.com'
  const isMarketingRoute = requestHeaders.get('x-axildb-marketing') === '1'

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const preference = localStorage.getItem('axildb-theme') || 'system';
                  const dark = preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
                  document.documentElement.dataset.themePreference = preference;
                } catch {
                  document.documentElement.dataset.theme = 'light';
                  document.documentElement.dataset.themePreference = 'system';
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        {isMarketingHost || isMarketingRoute ? (
          children
        ) : (
          <div className="min-h-screen md:flex">
            <ScrollPreserver />
            <Sidebar />
            <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        )}
      </body>
    </html>
  )
}
