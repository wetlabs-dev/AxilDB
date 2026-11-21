// Code-only prewarming never requests camera permission or retains a stream.
let ready: Promise<typeof import('./qr-decode')> | undefined
export function warmQrDecoder() { return ready ||= import('./qr-decode').catch(error => { ready = undefined; throw error }) }
