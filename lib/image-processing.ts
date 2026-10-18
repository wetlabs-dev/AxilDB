/** Fail fast rather than queueing requests that retain multipart bodies and buffers. */
export class ResourceSlots {
  private active = 0
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new Error('Invalid resource capacity.')
  }
  acquire() {
    if (this.active >= this.capacity) return null
    this.active++
    let released = false
    return () => {
      if (!released) {
        released = true
        this.active--
      }
    }
  }
  get inUse() {
    return this.active
  }
}
// Per web process, shared by photo uploads and AI identification uploads.
export const imageProcessingSlots = new ResourceSlots(2)
