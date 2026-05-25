'use client'

import { Laptop, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type ThemePreference = 'light' | 'dark' | 'system'

function applyTheme(preference: ThemePreference) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || (preference === 'system' && systemDark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.themePreference = preference
  localStorage.setItem('axildb-theme', preference)
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system')

  useEffect(() => {
    const stored = localStorage.getItem('axildb-theme')
    const initial = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
    setPreference(initial)
    applyTheme(initial)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if ((localStorage.getItem('axildb-theme') || 'system') === 'system') applyTheme('system')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const options: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Laptop },
  ]

  return (
    <div className="theme-toggle grid gap-1">
      <p className="px-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-stone-500">Theme</p>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-stone-200 bg-white/55 p-1">
        {options.map(({ value, label, Icon }) => {
          const active = preference === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              title={label}
              onClick={() => {
                setPreference(value)
                applyTheme(value)
              }}
              className={[
                'inline-flex min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                active ? 'bg-[#2f6b45] text-white shadow-sm' : 'text-stone-700 hover:bg-[#d6dfc9]/70 hover:text-[#1f472f]',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
