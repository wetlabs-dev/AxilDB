'use client'

import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/utils'

type ConfirmDeleteButtonProps = {
  children: any
  title: string
  message: string
  confirmLabel?: string
  pendingLabel?: string
  pendingMessage?: string
  className?: string
  confirmClassName?: string
}

export function ConfirmDeleteButton({
  children,
  title,
  message,
  confirmLabel = 'Delete',
  pendingLabel = 'Working...',
  pendingMessage = 'The request is still running. This can take a few moments.',
  className = '',
  confirmClassName = '',
}: ConfirmDeleteButtonProps) {
  const { pending } = useFormStatus()

  return (
    <span data-confirm-delete>
      <button
        data-confirm-delete-trigger
        type="button"
        disabled={pending}
        className={cn('rounded-md bg-[#9a3f35] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#7d3028] disabled:cursor-wait disabled:opacity-75', className)}
        onClick={(event) => {
          const wrapper = event.currentTarget.closest('[data-confirm-delete]')
          const dialog = wrapper?.querySelector('dialog')
          dialog?.showModal()
        }}
      >
        {pending ? pendingLabel : children}
      </button>

      <dialog className="w-full max-w-md rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-solid)] p-5 text-[var(--ax-text)] shadow-xl backdrop:bg-black/50">
        <h2 className="text-lg font-bold text-[var(--ax-heading)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--ax-text)]">{message}</p>
        {pending && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#8fa58f]/60 bg-[#edf3e6] px-3 py-3 text-sm font-semibold text-[#255537]" role="status" aria-live="polite">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#8fa58f] border-t-[#2f6b45]" aria-hidden="true" />
            <span>{pendingMessage}</span>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-4 py-2 text-sm font-medium text-[var(--ax-text)] hover:bg-[var(--ax-primary-wash)] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={(event) => event.currentTarget.closest('dialog')?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            className={cn('rounded-md bg-[#9a3f35] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#7d3028] disabled:cursor-wait disabled:opacity-75', confirmClassName)}
            onClick={(event) => {
              const wrapper = event.currentTarget.closest('[data-confirm-delete]')
              const trigger = wrapper?.querySelector('[data-confirm-delete-trigger]')
              trigger?.closest('form')?.requestSubmit()
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </dialog>
    </span>
  )
}
