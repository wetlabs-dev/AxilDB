'use server'
import { redirect } from 'next/navigation'
import { audit, requireServerAdmin } from '@/lib/auth'
import { deleteMigrationArchive, migrationArchivePath, queueMigration } from '@/lib/admin/instance-migration'

export async function requestMigration(form: FormData) {
  const user = await requireServerAdmin()
  const command = String(form.get('command'))
  if (command !== 'create' && command !== 'verify' && command !== 'preflight') throw new Error('Invalid migration operation.')
  const archive = command === 'verify' ? String(form.get('archive')) : undefined
  if (archive) migrationArchivePath(archive)
  if (command === 'create' && form.get('downtime') !== 'accepted') throw new Error('Acknowledge the offline migration window first.')
  const job = await queueMigration(command, user.email, { archive, keepStopped: form.get('keepStopped') === 'on' })
  await audit(user, 'REQUEST', 'INSTANCE_MIGRATION', job.id, `Requested migration ${command}`)
  redirect('/server/migrations?queued=1')
}
export async function deleteMigration(form: FormData) {
  const user = await requireServerAdmin()
  const archive = String(form.get('archive'))
  migrationArchivePath(archive)
  if (form.get('confirmation') !== archive) throw new Error('Type the exact archive name to delete it.')
  await deleteMigrationArchive(archive)
  await audit(user, 'DELETE', 'INSTANCE_MIGRATION', archive, 'Deleted migration archive')
  redirect('/server/migrations')
}
