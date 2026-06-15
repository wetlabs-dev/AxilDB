import './globals.css'
import { ScrollPreserver } from '@/components/ScrollPreserver'
import { Sidebar } from '@/components/sidebar'
import { headers } from 'next/headers'
import { getCurrentUser, isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/time'

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
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3f6212',
}

const maintenanceAllowedPrefixes = ['/login', '/forgot-password', '/reset-password', '/magic-login', '/two-factor', '/verify-email']

function MaintenanceScreen({ message, expectedReturnAt }: { message?: string | null; expectedReturnAt?: Date | null }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f3e6] px-5 py-12 text-stone-900">
      <section className="w-full max-w-2xl rounded-lg border border-stone-200 bg-white/85 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#2f6b45]">Maintenance mode</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold">AxilDB is currently undergoing maintenance.</h1>
        {message && <p className="mt-5 text-lg leading-8 text-stone-700">{message}</p>}
        {expectedReturnAt && (
          <p className="mt-5 rounded-md border border-stone-200 bg-[#fffaf0] px-4 py-3 text-sm text-stone-700">
            Expected return: <span className="font-semibold">{formatDateTime(expectedReturnAt)}</span>
          </p>
        )}
        <p className="mt-6 text-sm text-stone-500">Server admins can still sign in and manage the maintenance window.</p>
      </section>
    </main>
  )
}

export default async function RootLayout({children}:{children:React.ReactNode}) {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')?.split(':')[0] || ''
  const isMarketingHost = host === 'axildb.com' || host === 'www.axildb.com'
  const isMarketingRoute = requestHeaders.get('x-axildb-marketing') === '1'
  const requestPath = requestHeaders.get('x-axildb-path') || '/'
  const maintenanceMode = await prisma.maintenanceMode.findFirst({ where: { enabled: true }, orderBy: { updatedAt: 'desc' } })
  const maintenanceAuthAllowed = maintenanceAllowedPrefixes.some((prefix) => requestPath.startsWith(prefix))
  const user = maintenanceMode && !maintenanceAuthAllowed ? await getCurrentUser() : null
  const showMaintenance = Boolean(maintenanceMode && !maintenanceAuthAllowed && !isAdmin(user))

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
        {showMaintenance ? (
          <MaintenanceScreen message={maintenanceMode?.message} expectedReturnAt={maintenanceMode?.expectedReturnAt} />
        ) : isMarketingHost || isMarketingRoute ? (
          children
        ) : (
          <div className="min-h-screen min-w-0 md:flex">
            <ScrollPreserver />
            <Sidebar />
            <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        )}
      </body>
    </html>
  )
}
