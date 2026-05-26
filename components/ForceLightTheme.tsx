'use client'

import { useEffect } from 'react'

type ThemePreference = 'light' | 'dark' | 'system'

function storedPreference(): ThemePreference {
  const preference = localStorage.getItem('axildb-theme')
  if (preference === 'light' || preference === 'dark' || preference === 'system') {
    return preference
  }
  return 'system'
}

function resolvedTheme(preference: ThemePreference) {
  if (preference === 'light' || preference === 'dark') {
    return preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement
    const previousTheme = root.dataset.theme
    const previousPreference = root.dataset.themePreference

    root.dataset.theme = 'light'
    root.dataset.themePreference = 'light'

    return () => {
      try {
        const preference = storedPreference()
        root.dataset.theme = resolvedTheme(preference)
        root.dataset.themePreference = preference
      } catch {
        if (previousTheme) {
          root.dataset.theme = previousTheme
        } else {
          delete root.dataset.theme
        }
        if (previousPreference) {
          root.dataset.themePreference = previousPreference
        } else {
          delete root.dataset.themePreference
        }
      }
    }
  }, [])

  return null
}
