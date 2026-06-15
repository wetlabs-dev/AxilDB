import { NextResponse, type NextRequest } from 'next/server'
import { RETURN_TO_HEADER } from '@/lib/redirects'

const marketingHosts = new Set(['axildb.com', 'www.axildb.com'])
const publicFile = /\.(.*)$/

function requestHeadersWithPath(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-axildb-path', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return requestHeaders
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
    const requestHeaders = requestHeadersWithPath(request)
    requestHeaders.set('x-axildb-collection', decodeURIComponent(slug))
    requestHeaders.set(RETURN_TO_HEADER, `${pathname}${search}`)
    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    })
  }

  if (pathname === '/splash') {
    const requestHeaders = requestHeadersWithPath(request)
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
      const requestHeaders = requestHeadersWithPath(request)
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

  return NextResponse.next({
    request: {
      headers: requestHeadersWithPath(request),
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
