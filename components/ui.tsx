import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Card({ className = '', children }: any) {
  return <div className={cn('rounded-2xl border bg-white/80 p-5 shadow-sm', className)}>{children}</div>
}

export function Button({ className = '', children, ...props }: any) {
  return (
    <button
      className={cn('rounded-xl bg-green-800 px-4 py-2 text-sm font-medium text-white hover:bg-green-900', className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function DangerButton({ className = '', children, ...props }: any) {
  return (
    <button
      className={cn('rounded-xl bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900', className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function LinkButton({ href, children, className = '' }: any) {
  return (
    <Link href={href} className={cn('rounded-xl bg-green-800 px-4 py-2 text-sm font-medium text-white hover:bg-green-900', className)}>
      {children}
    </Link>
  )
}

export function GhostLink({ href, children }: any) {
  return (
    <Link className="rounded-lg px-3 py-2 text-sm hover:bg-green-900/10" href={href}>
      {children}
    </Link>
  )
}

export function Field({ label, name, type = 'text', required = false, defaultValue, children, ...props }: any) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      {children ?? (
        <input
          className="rounded-lg border px-3 py-2 font-normal"
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue ?? ''}
          {...props}
        />
      )}
    </label>
  )
}

export function TextArea({ label, name, defaultValue, ...props }: any) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <textarea
        className="min-h-24 rounded-lg border px-3 py-2 font-normal"
        name={name}
        defaultValue={defaultValue ?? ''}
        {...props}
      />
    </label>
  )
}

export function Select({ label, name, defaultValue, children, ...props }: any) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select className="rounded-lg border px-3 py-2 font-normal" name={name} defaultValue={defaultValue} {...props}>
        {children}
      </select>
    </label>
  )
}
