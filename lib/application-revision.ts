import { readFile } from 'node:fs/promises'
import path from 'node:path'

// Read from the running image, never a mutable host checkout or branch pointer.
export async function applicationRevision() {
  try {
    const value = (
      await readFile(path.join(process.cwd(), 'REVISION'), 'utf8')
    ).trim()
    return /^[0-9a-f]{40}$/.test(value) ? value : 'unknown'
  } catch {
    return 'unknown'
  }
}
