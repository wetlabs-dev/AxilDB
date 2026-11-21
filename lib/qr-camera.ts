import { qrDecodeDelay, qrFrameCrop } from '@/lib/qr-framing'
import type { QrStage } from '@/lib/qr-performance'
export type CameraState = { status: 'initializing' | 'scanning' | 'paused' | 'unavailable'; message: string; torch: boolean; torchSupported: boolean; canSwitch: boolean }
export type FrameDecoder = (pixels: Uint8ClampedArray, width: number, height: number) => string | null | Promise<string | null>
export function cameraError(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was denied. Allow camera access in your browser settings, or use a photo or manual lookup.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No suitable camera is available. Try another camera, a photo or manual lookup.'
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera is unavailable or in use. Close other camera apps and try again.'
  return 'The camera could not start. Try again, choose a photo or enter an accession ID.'
}
/** One camera, one reusable canvas, one throttled decoding timer. No React frame state. */
export class QrCamera {
  private generation = 0
  private stream: MediaStream | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private canvas: HTMLCanvasElement | null = null
  private devices: MediaDeviceInfo[] = []
  private deviceId: string | undefined
  private wanted = false
  private torchBusy = false
  private ended: (() => void) | undefined
  private state: CameraState = { status: 'paused', message: '', torch: false, torchSupported: false, canSwitch: false }
  constructor(private video: HTMLVideoElement, private decode: FrameDecoder, private onState: (state: CameraState) => void, private onPayload: (text: string) => void, private mark: (stage: QrStage) => void = () => {}) {}
  private publish(state: Partial<CameraState>) { this.state = { ...this.state, ...state }; this.onState(this.state) }
  private release() {
    this.generation++; this.torchBusy = false
    clearTimeout(this.timer); this.timer = undefined
    for (const track of this.stream?.getTracks() || []) { if (this.ended) track.removeEventListener('ended', this.ended); track.stop() }
    this.stream = null; this.ended = undefined; this.video.pause(); this.video.srcObject = null
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0; this.canvas = null }
  }
  stop() { this.wanted = false; this.release(); this.publish({ status: 'paused', message: 'Camera paused.', torch: false, torchSupported: false, canSwitch: false }) }
  background() { const wanted = this.wanted; this.release(); this.wanted = wanted; this.publish({ status: 'paused', message: 'Camera paused while the app is in the background.', torch: false }) }
  foreground() { if (this.wanted && this.state.status === 'paused') void this.start(this.deviceId) }
  async start(deviceId?: string) {
    this.release(); this.wanted = true
    const version = this.generation
    this.publish({ status: 'initializing', message: 'Starting camera…', torch: false, torchSupported: false, canSwitch: false })
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) { this.wanted = false; this.publish({ status: 'unavailable', message: 'Camera scanning needs HTTPS and a supported browser. Use a photo or manual lookup instead.' }); return }
    let acquired: MediaStream | undefined
    try {
      let preferred = deviceId
      if (!preferred) { try { preferred = localStorage.getItem('axildb-qr-camera') || undefined } catch { /* Camera choice is optional, never a permission flag. */ } }
      this.mark('permissionRequested')
      acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(preferred ? { deviceId: { ideal: preferred } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } })
      this.mark('streamAcquired')
      if (version !== this.generation || !this.wanted || document.visibilityState === 'hidden') { acquired.getTracks().forEach(track => track.stop()); return }
      this.stream = acquired
      const track = acquired.getVideoTracks()[0]
      if (!track) throw new Error('No video track')
      this.deviceId = track.getSettings().deviceId || deviceId
      if (this.deviceId) { try { localStorage.setItem('axildb-qr-camera', this.deviceId) } catch { /* A preferred device is not a permission grant. */ } }
      this.video.srcObject = acquired
      await this.video.play()
      if (version !== this.generation) return
      // Device enumeration is optional UI metadata; never block the first decode on it.
      void navigator.mediaDevices.enumerateDevices().then(devices => { if (version === this.generation) { this.devices = devices.filter(device => device.kind === 'videoinput'); this.publish({ canSwitch: this.devices.length > 1 }) } }).catch(() => {})
      this.ended = () => { if (version === this.generation) { this.stop(); this.publish({ status: 'unavailable', message: 'The camera disconnected. Try again or use manual lookup.', torch: false }) } }
      track.addEventListener('ended', this.ended)
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean } | undefined
      const focus = capabilities as MediaTrackCapabilities & { focusMode?: string[] }
      if (focus?.focusMode?.includes('continuous')) void track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})
      this.publish({ status: 'scanning', message: 'Looking for a label…', torchSupported: capabilities?.torch === true, canSwitch: false })
      this.canvas = document.createElement('canvas')
      const context = this.canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas unavailable')
      let attempt = 0
      const frame = async () => {
        const started = performance.now()
        if (version !== this.generation || !this.stream || !this.canvas) return
        try {
          if (this.video.readyState >= 2 && this.video.videoWidth && this.video.videoHeight) {
            this.mark('videoReady')
            const pass = attempt++
            const crop = qrFrameCrop(this.video.videoWidth, this.video.videoHeight, this.video.clientWidth, this.video.clientHeight, pass)
            const scale = Math.min(1, (pass % 3 === 0 ? 960 : 1280) / Math.max(crop.width, crop.height))
            const width = Math.max(1, Math.round(crop.width * scale)), height = Math.max(1, Math.round(crop.height * scale))
            if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height }
            context.drawImage(this.video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)
            const result = await this.decode(context.getImageData(0, 0, width, height).data, width, height)
            if (version !== this.generation) return
            if (result) { this.mark('recognized'); this.stop(); this.onPayload(result); return }
          }
          // Serialized adaptive loop: fast attempts without saturating slower devices.
          if (version === this.generation) this.timer = setTimeout(frame, qrDecodeDelay(performance.now()-started))
        } catch { if (version !== this.generation) return; this.stop(); this.publish({ status: 'unavailable', message: 'Camera scanning was interrupted. Try again or choose a photo.', torch: false }) }
      }
      void frame()
    } catch (error) {
      if (version !== this.generation) { acquired?.getTracks().forEach(track => track.stop()); return }
      this.stop(); this.publish({ status: 'unavailable', message: cameraError(error), torch: false })
    }
  }
  switchCamera() { const index = this.devices.findIndex(device => device.deviceId === this.deviceId); const next = this.devices[(index + 1) % this.devices.length]; if (next) { try { localStorage.setItem('axildb-qr-camera', next.deviceId) } catch { /* Optional preference. */ } void this.start(next.deviceId) } }
  async toggleTorch() {
    const track = this.stream?.getVideoTracks()[0], version = this.generation
    if (!track || !this.state.torchSupported || this.torchBusy) return
    this.torchBusy = true
    try { await track.applyConstraints({ advanced: [{ torch: !this.state.torch } as MediaTrackConstraintSet] }); if (version === this.generation) this.publish({ torch: !this.state.torch }) }
    catch { if (version === this.generation) this.publish({ torch: false, torchSupported: false, message: 'Flashlight control is unavailable on this camera.' }) }
    finally { if (version === this.generation) this.torchBusy = false }
  }
}
