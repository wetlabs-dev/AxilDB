'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { toggleSunshine } from '@/app/actions'

const STORAGE_KEY = 'axildb:sunshine-scroll'

type SunshineFormProps = {
  id: string
  children: ReactNode
}

type SavedScroll = {
  path: string
  x: number
  y: number
}

function restoreSavedScroll() {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return

  let saved: SavedScroll | null = null
  try {
    saved = JSON.parse(raw)
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }

  const currentPath = `${window.location.pathname}${window.location.search}`
  if (!saved || saved.path !== currentPath) return
  window.sessionStorage.removeItem(STORAGE_KEY)

  const scroll = () => window.scrollTo(saved.x, saved.y)
  scroll()
  window.requestAnimationFrame(() => {
    scroll()
    window.requestAnimationFrame(scroll)
  })
  window.setTimeout(scroll, 150)
  window.setTimeout(scroll, 500)
}

export function SunshineForm({ id, children }: SunshineFormProps) {
  useEffect(() => {
    restoreSavedScroll()
  }, [])

  return (
    <form
      id={id}
      action={toggleSunshine}
      onSubmit={() => {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          path: `${window.location.pathname}${window.location.search}`,
          x: window.scrollX,
          y: window.scrollY,
        }))
      }}
    >
      {children}
    </form>
  )
}
