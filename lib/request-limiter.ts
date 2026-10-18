/** Per-process abuse guard. Never evict an active user to admit another user. */
export class RequestLimiter {
  private entries = new Map<string, number[]>()
  private nextSweep = 0
  constructor(
    private capacity = 10_000,
    private windowMs = 3_600_000,
    private now = Date.now
  ) {}
  get size() {
    return this.entries.size
  }
  allow(key: string, limit: number) {
    const now = this.now()
    if (now >= this.nextSweep) {
      for (const [id, times] of this.entries)
        if (times[times.length - 1] <= now - this.windowMs)
          this.entries.delete(id)
      this.nextSweep = now + 60_000
    }
    const recent = (this.entries.get(key) || []).filter(
      (time) => time > now - this.windowMs
    )
    // Bound even misconfigured limits; zero/NaN remain fail-closed.
    const maximum = Math.min(10_000, Math.floor(limit))
    if (
      !(maximum > 0) ||
      recent.length >= maximum ||
      (!this.entries.has(key) && this.entries.size >= this.capacity)
    )
      return false
    recent.push(now)
    this.entries.set(key, recent)
    return true
  }
}
