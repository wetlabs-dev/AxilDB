/** Opt-in local diagnostics only. No frames, payloads, identifiers or network telemetry. */
export type QrStage = 'pressed' | 'mounted' | 'permissionRequested' | 'streamAcquired' | 'videoReady' | 'decoderReady' | 'firstDecode' | 'recognized' | 'validated' | 'lookupStart' | 'lookupEnd' | 'navigationStart' | 'destinationRendered'
export type QrTiming = { id: number; stages: Partial<Record<QrStage, number>> }
type DebugWindow = Window & { __axildbQrTimings?: QrTiming[] }
let serial = 0, active: QrTiming | undefined
export function beginQrTiming() {
  if (typeof window === 'undefined') return
  let enabled = process.env.NODE_ENV === 'development'
  try { enabled ||= localStorage.getItem('axildb-qr-debug') === '1' } catch { /* Private browsing may disable storage. */ }
  active = enabled ? { id: ++serial, stages: {} } : undefined
  if (active) { const target = window as DebugWindow; target.__axildbQrTimings = [...(target.__axildbQrTimings || []).slice(-29), active]; markQrTiming('pressed') }
  return active?.id
}
export function qrTimingId() { return active?.id }
export function markQrTiming(stage: QrStage, id = active?.id) { if (active && active.id === id && active.stages[stage] === undefined) active.stages[stage] = performance.now() }
export function finishQrNavigation() { if (active?.stages.navigationStart !== undefined) markQrTiming('destinationRendered') }
