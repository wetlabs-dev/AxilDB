import { NextResponse, type NextRequest } from 'next/server'

const marketingHosts = new Set(['axildb.com', 'www.axildb.com'])

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] || ''
  const { pathname, search } = request.nextUrl

  if (marketingHosts.has(host)) {
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/splash'
      return NextResponse.rewrite(url)
    }

    if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
      return NextResponse.next()
    }

    const url = request.nextUrl.clone()
    url.hostname = 'app.axildb.com'
    url.pathname = pathname
    url.search = search
    return NextResponse.redirect(url)
  }

  if (host === 'app.axildb.com' && pathname === '/splash') {
    const url = request.nextUrl.clone()
    url.hostname = 'axildb.com'
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
