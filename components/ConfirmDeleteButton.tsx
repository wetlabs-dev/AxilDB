'use client'

import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ConfirmDeleteButtonProps = {
  children: ReactNode
  title: string
  message: string
  confirmLabel?: string
  className?: string
}

export function ConfirmDeleteButton({
  children,
  title,
  message,
  confirmLabel = 'Delete',
  className = '',
}: ConfirmDeleteButtonProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const submitForm = () => {
    const form = buttonRef.current?.closest('form')
    form?.requestSubmit()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cn('rounded-xl bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900', className)}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation">
          <div
            className="w-full max-w-md rounded-lg border bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
          >
            <h2 id="confirm-delete-title" className="text-lg font-bold">
              {title}
            </h2>
            <p className="mt-2 text-sm text-neutral-700">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900"
                onClick={submitForm}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
