import { NextResponse, type NextRequest } from 'next/server'

const marketingHosts = new Set(['axildb.com', 'www.axildb.com'])
const publicFile = /\.(.*)$/

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] || ''
  const { pathname, search } = request.nextUrl

  if (host === 'app.axildb.com' && pathname === '/splash') {
    const url = new URL('/', 'https://axildb.com')
    return NextResponse.redirect(url)
  }

  if (pathname === '/splash') {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-axildb-marketing', '1')
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
