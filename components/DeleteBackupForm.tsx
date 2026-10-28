'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSelectedBackup } from '@/app/server-actions'

export function DeleteBackupForm({ backupPath, name, active = false }: { backupPath: string; name: string; active?: boolean }) {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState(''), [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const submitting = useRef(false)
  return <form className="grid min-w-0 gap-2" onSubmit={event => {
    event.preventDefault()
    if (submitting.current || active || confirmation.trim() !== name) return
    const fd = new FormData()
    fd.set('backupPath', backupPath); fd.set('expectedName', name); fd.set('confirmation', confirmation)
    submitting.current = true; setError('')
    startTransition(async () => {
      try {
        const result = await deleteSelectedBackup(fd)
        if ('error' in result) setError(result.error)
        else router.replace(`/server?backup=${'removed' in result ? 'deleted' : 'deletion-requested'}#backup-storage`, { scroll: false })
      } catch { setError('Could not confirm the deletion request. Refresh the backup list before retrying; your confirmation has been kept.') }
      finally { submitting.current = false }
    })
  }}>
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <label className="grid min-w-0 gap-1 font-semibold">
        <span className="break-all">Type {name} to confirm</span>
        <input name="confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={pending || active} className="min-h-11 w-full min-w-0 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-normal text-stone-900 sm:min-w-72" />
      </label>
      <button type="submit" disabled={pending || active || confirmation.trim() !== name} className="min-h-11 rounded-md border border-red-300 bg-red-100 px-3 py-2 text-sm font-semibold text-red-950 disabled:opacity-50">{pending ? 'Requesting deletion…' : 'Delete backup'}</button>
    </div>
    {active && <p className="text-xs">This backup cannot be deleted while its linked run is active.</p>}
    <p role={error ? 'alert' : 'status'} aria-live="polite" className="text-sm text-red-900">{error || (pending ? 'Recording deletion intent for the backup worker…' : '')}</p>
  </form>
}
