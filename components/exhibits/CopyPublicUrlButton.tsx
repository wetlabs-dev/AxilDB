'use client'

import { useEffect, useRef, useState } from 'react'
import { Link2 } from 'lucide-react'

export function CopyPublicUrlButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  async function copyUrl() {
    const url = new URL(path, window.location.origin).toString()
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      type="button"
      onClick={copyUrl}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-white/70 text-stone-800 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6b45]/35 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)] dark:text-[color:var(--ax-text)] dark:hover:bg-[color:var(--ax-surface)]"
      aria-label={copied ? 'Public URL copied' : 'Copy public URL'}
      title={copied ? 'Copied' : 'Copy public URL'}
    >
      <Link2 className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{copied ? 'Copied' : 'Copy public URL'}</span>
    </button>
  )
}
