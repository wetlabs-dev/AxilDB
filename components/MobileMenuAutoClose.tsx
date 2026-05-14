'use client'

import { useEffect } from 'react'

export function MobileMenuAutoClose() {
  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null
      const link = target?.closest('a[href]')
      const menu = target?.closest('details[data-mobile-menu]')

      if (link && menu instanceof HTMLDetailsElement) {
        menu.open = false
      }
    }

    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [])

  return null
}
