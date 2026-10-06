import { access } from 'node:fs/promises'
import path from 'node:path'

// Shared with the host restore journal, not imported from the source database.
// Fail closed on permission/I/O errors; never cache across release.
export async function migrationOutboundHeld() {
  try {
    await access(path.resolve(process.cwd(), process.env.AXILDB_BACKUP_ROOT || 'backups', '.migration/outbound-hold.json'))
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
export async function assertMigrationOutboundReleased() {
  if (await migrationOutboundHeld()) throw new Error('Destination services are held after restore. Verify configuration and release the migration hold from the host.')
}
