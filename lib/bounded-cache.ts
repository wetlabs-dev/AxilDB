/** Lazy expiry avoids a process-wide timer. Values have a fixed lifetime, not a sliding TTL. */
export class BoundedCache<T> {
  private entries = new Map<string, { value: T; expires: number }>()
  constructor(
    readonly capacity: number,
    readonly ttlMs: number,
    private now = Date.now
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || ttlMs <= 0)
      throw new Error('Invalid cache bounds.')
  }
  get size() {
    this.sweep()
    return this.entries.size
  }
  private sweep() {
    const now = this.now()
    for (const [key, entry] of this.entries)
      if (entry.expires <= now) this.entries.delete(key)
  }
  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expires <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }
  set(key: string, value: T) {
    this.sweep()
    this.entries.delete(key)
    while (this.entries.size >= this.capacity)
      this.entries.delete(this.entries.keys().next().value!)
    this.entries.set(key, { value, expires: this.now() + this.ttlMs })
  }
  delete(key: string) {
    this.entries.delete(key)
  }
}
