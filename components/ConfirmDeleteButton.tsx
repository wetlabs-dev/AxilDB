'use client'

import { cn } from '@/lib/utils'

type ConfirmDeleteButtonProps = {
  children: any
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
  return (
    <span data-confirm-delete>
      <button
        data-confirm-delete-trigger
        type="button"
        className={cn('rounded-md bg-[#9a3f35] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#7d3028]', className)}
        onClick={(event) => {
          const wrapper = event.currentTarget.closest('[data-confirm-delete]')
          const dialog = wrapper?.querySelector('dialog')
          dialog?.showModal()
        }}
      >
        {children}
      </button>

      <dialog className="w-full max-w-md rounded-lg border border-stone-200 bg-[#fffaf0] p-5 shadow-xl backdrop:bg-black/40">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm text-neutral-700">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-stone-300 bg-[#fffdf7] px-4 py-2 text-sm font-medium hover:bg-stone-50"
            onClick={(event) => event.currentTarget.closest('dialog')?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-[#9a3f35] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#7d3028]"
            onClick={(event) => {
              const wrapper = event.currentTarget.closest('[data-confirm-delete]')
              const trigger = wrapper?.querySelector('[data-confirm-delete-trigger]')
              trigger?.closest('form')?.requestSubmit()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </span>
  )
}
