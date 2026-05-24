'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

const prefix = 'axildb:scroll:'
const pathPrefix = 'axildb:scroll-path:'

function keyFor(path: string) {
  return `${prefix}${path}`
}

function pathKeyFor(pathname: string) {
  return `${pathPrefix}${pathname}`
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}`
}

function saveScroll(path: string, pathname = window.location.pathname) {
  const value = String(Math.max(0, Math.round(window.scrollY)))
  sessionStorage.setItem(keyFor(path), value)
  sessionStorage.setItem(pathKeyFor(pathname), value)
}

function restoreScroll(path: string, pathname: string) {
  const exactKey = keyFor(path)
  const fallbackKey = pathKeyFor(pathname)
  const saved = sessionStorage.getItem(exactKey) ?? sessionStorage.getItem(fallbackKey)
  if (saved == null) return

  sessionStorage.removeItem(exactKey)
  sessionStorage.removeItem(fallbackKey)

  const y = Number(saved)
  if (!Number.isFinite(y)) return

  requestAnimationFrame(() => {
    window.scrollTo({ top: y, behavior: 'instant' })
    window.setTimeout(() => window.scrollTo({ top: y, behavior: 'instant' }), 80)
  })
}

export function ScrollPreserver() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const path = search ? `${pathname}?${search}` : pathname

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    restoreScroll(path, pathname)
  }, [path, pathname])

  useEffect(() => {
    function onSubmit() {
      saveScroll(currentPath())
    }

    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement)) return
      if (target.target && target.target !== '_self') return

      const url = new URL(target.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname !== window.location.pathname) return

      saveScroll(`${url.pathname}${url.search}`, url.pathname)
    }

    window.addEventListener('submit', onSubmit, true)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('submit', onSubmit, true)
      window.removeEventListener('click', onClick, true)
    }
  }, [])

  return null
}
