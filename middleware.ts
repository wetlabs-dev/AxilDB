import { NextResponse, type NextRequest } from 'next/server'
import { RETURN_TO_HEADER } from '@/lib/redirects'

const marketingHosts = new Set(['axildb.com', 'www.axildb.com'])
const publicFile = /\.(.*)$/
const defaultCollectionSlug = 'axildb'
const collectionRoutePrefixes = [
  '/',
  '/plants',
  '/instances',
  '/propagations',
  '/blooms',
  '/gallery',
  '/graphs',
  '/search',
  '/care',
  '/care-sheets',
  '/following',
  '/reminders',
  '/collection-settings',
  '/settings',
  '/members',
  '/sports',
  '/labels',
  '/archived',
  '/audit',
  '/admin-tools',
]
const globalPrefixes = [
  '/api',
  '/uploads',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/magic-login',
  '/verify-email',
  '/two-factor',
  '/help',
  '/account',
  '/users',
  '/server',
  '/collections',
  '/collection-access',
  '/care-sheet',
  '/sitter',
]

function isCollectionRoute(pathname: string) {
  return collectionRoutePrefixes.some((prefix) => pathname === prefix || (prefix !== '/' && pathname.startsWith(`${prefix}/`)))
}

function isGlobalRoute(pathname: string) {
  return globalPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] || ''
  const { pathname, search } = request.nextUrl

  if (host === 'app.axildb.com' && pathname === '/splash') {
    const url = new URL('/', 'https://axildb.com')
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/c/')) {
    const [, , slug, ...rest] = pathname.split('/')
    const url = request.nextUrl.clone()
    url.pathname = `/${rest.join('/')}` || '/'
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-axildb-collection', decodeURIComponent(slug || defaultCollectionSlug))
    requestHeaders.set(RETURN_TO_HEADER, `${pathname}${search}`)
    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    })
  }

  if (!marketingHosts.has(host) && !pathname.startsWith('/_next') && !publicFile.test(pathname) && !isGlobalRoute(pathname) && isCollectionRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = `/c/${defaultCollectionSlug}${pathname === '/' ? '' : pathname}`
    return NextResponse.redirect(url)
  }

  if (pathname === '/splash') {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-axildb-marketing', '1')
    requestHeaders.set(RETURN_TO_HEADER, `${pathname}${search}`)
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  if (marketingHosts.has(host)) {
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/splash'
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-axildb-marketing', '1')
      requestHeaders.set(RETURN_TO_HEADER, `${pathname}${search}`)
      return NextResponse.rewrite(url, {
        request: {
          headers: requestHeaders,
        },
      })
    }

    if (pathname.startsWith('/_next') || publicFile.test(pathname)) {
      return NextResponse.next()
    }

    const url = new URL(`${pathname}${search}`, 'https://app.axildb.com')
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
