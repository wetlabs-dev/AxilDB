import Link from 'next/link'
import { cn } from '@/lib/utils'

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'
const primary = 'rounded-md bg-[#2f6b45] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#255537]'

export function Card({ className = '', children }: any) {
  return <div className={cn('rounded-lg border border-stone-200/90 bg-[#fffaf0]/82 p-4 shadow-[0_8px_30px_rgba(47,38,24,0.07)] sm:p-5', className)}>{children}</div>
}

export function Button({ className = '', children, ...props }: any) {
  return (
    <button className={cn(primary, className)} {...props}>
      {children}
    </button>
  )
}

export function DangerButton({ className = '', children, ...props }: any) {
  return (
    <button
      className={cn('rounded-md bg-[#9a3f35] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#7d3028]', className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function LinkButton({ href, children, className = '' }: any) {
  return (
    <Link href={href} className={cn(primary, 'inline-flex items-center justify-center', className)}>
      {children}
    </Link>
  )
}

export function GhostLink({ href, children }: any) {
  return (
    <Link className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-stone-800 transition hover:bg-[#d6dfc9]/70 hover:text-[#1f472f]" href={href}>
      {children}
    </Link>
  )
}

export function Field({ label, name, type = 'text', required = false, defaultValue, children, wrapperClassName = '', className = '', ...props }: any) {
  return (
    <label className={cn('grid gap-1 text-sm font-medium text-stone-800', wrapperClassName)}>
      {label}
      {children ?? (
        <input
          className={cn(control, className)}
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

export function TextArea({ label, name, defaultValue, wrapperClassName = '', className = '', ...props }: any) {
  return (
    <label className={cn('grid gap-1 text-sm font-medium text-stone-800', wrapperClassName)}>
      {label}
      <textarea
        className={cn(control, 'min-h-20', className)}
        name={name}
        defaultValue={defaultValue ?? ''}
        {...props}
      />
    </label>
  )
}

export function Select({ label, name, defaultValue, children, wrapperClassName = '', className = '', ...props }: any) {
  return (
    <label className={cn('grid gap-1 text-sm font-medium text-stone-800', wrapperClassName)}>
      {label}
      <select className={cn(control, className)} name={name} defaultValue={defaultValue} {...props}>
        {children}
      </select>
    </label>
  )
}
