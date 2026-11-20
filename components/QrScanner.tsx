'use client'
import { formatTypography } from '@/lib/typography'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Camera, Check, Flashlight, ImagePlus, Loader2, SwitchCamera, X } from 'lucide-react'
import { QrCamera, type CameraState } from '@/lib/qr-camera'
import { parseQrPayload, qrTargetKey } from '@/lib/qr-payload'
import type { QrRecord } from '@/lib/qr-resolution'

type PhotoChoice = { payload: string; label: string }
export default function QrScanner({ origins, onClose, onFound, currentPath }: { origins: string[]; onClose: () => void; onFound: (record: QrRecord) => void; currentPath: string }) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), camera = useRef<QrCamera | null>(null), generation = useRef(0), busy = useRef(false), request = useRef<AbortController | null>(null), alive = useRef(true)
  const [cameraState, setCameraState] = useState<CameraState>({ status: 'initializing', message: 'Starting camera…', torch: false, torchSupported: false, canSwitch: false })
  const [mode, setMode] = useState<'camera' | 'photo' | 'manual'>('camera'), [working, setWorking] = useState(false), [message, setMessage] = useState(''), [signIn, setSignIn] = useState(false), [last, setLast] = useState<{ payload: string; manual: boolean } | null>(null)
  const [records, setRecords] = useState<QrRecord[]>([]), [photos, setPhotos] = useState<PhotoChoice[]>([]), [manual, setManual] = useState('')
  const modeRef = useRef(mode)
  const resolver = useRef<(text: string, manual?: boolean) => void>(() => {})
  const allOrigins = () => [window.location.origin, ...origins]
  function cancelOperation() { generation.current++; request.current?.abort(); request.current = null; busy.current = false; setWorking(false) }
  function close() { alive.current = false; cancelOperation(); camera.current?.stop(); onClose() }
  function found(record: QrRecord) { if (!alive.current) return; camera.current?.stop(); cancelOperation(); alive.current = false; onFound(record) }
  async function resolve(payload: string, isManual = false) {
    if (busy.current || !alive.current) return
    camera.current?.stop(); busy.current = true; const version = ++generation.current
    setWorking(true); setRecords([]); setPhotos([]); setMessage('Looking up label…'); setSignIn(false); setLast({ payload, manual: isManual })
    const controller = new AbortController(); request.current = controller; const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      if (!parseQrPayload(payload, allOrigins(), isManual)) { setMessage(isManual ? 'Enter the exact plant accession ID or location code.' : 'This QR code is not a recognized AxilDB label.'); return }
      const response = await fetch('/api/qr/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, manual: isManual }), signal: controller.signal, redirect: 'error' })
      const result = await response.json()
      if (!alive.current || version !== generation.current || document.visibilityState === 'hidden') return
      if (!response.ok) { setMessage(result.error || 'We couldn’t look up this label. Check your connection and try again.'); setSignIn(result.signIn === true); return }
      if (!Array.isArray(result.records) || !result.records.length) throw new Error('No record')
      if (result.records.length === 1) found(result.records[0])
      else { setRecords(result.records); setMessage('Choose the matching record.') }
    } catch { if (alive.current && version === generation.current) setMessage('We couldn’t look up this label. Check your connection and try again.') }
    finally { clearTimeout(timeout); if (version === generation.current) { busy.current = false; setWorking(false) } }
  }
  resolver.current = resolve
  useEffect(() => {
    alive.current = true
    const sessionCounter = generation, element = dialog.current
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null, overflow = document.body.style.overflow
    element?.showModal(); document.body.style.overflow = 'hidden'
    let disposed = false
    void import('@/lib/qr-decode').then(decoder => {
      if (disposed || !video.current) return
      const engine = new QrCamera(video.current, decoder.decodeQrFrame, state => { if (!disposed) setCameraState(state) }, text => resolver.current(text))
      camera.current = engine
      if (document.visibilityState !== 'hidden' && modeRef.current === 'camera') void engine.start()
    }).catch(() => { if (!disposed) setCameraState({ status: 'unavailable', message: 'Scanner tools could not load. Check your connection and try opening the scanner again.', torch: false, torchSupported: false, canSwitch: false }) })
    const pagehide = () => { generation.current++; request.current?.abort(); if (busy.current) setMessage('Scanning paused. Retry lookup or choose a photo when you return.'); busy.current = false; setWorking(false); camera.current?.background() }
    const background = () => { if (document.visibilityState === 'hidden') pagehide(); else camera.current?.foreground() }
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted && document.visibilityState !== 'hidden') camera.current?.foreground() }
    document.addEventListener('visibilitychange', background); window.addEventListener('pagehide', pagehide); window.addEventListener('pageshow', pageshow)
    return () => { disposed = true; alive.current = false; sessionCounter.current++; request.current?.abort(); camera.current?.stop(); camera.current = null; document.removeEventListener('visibilitychange', background); window.removeEventListener('pagehide', pagehide); window.removeEventListener('pageshow', pageshow); element?.close(); document.body.style.overflow = overflow; if (origin?.isConnected) origin.focus({ preventScroll: true }) }
  }, [])
  function changeMode(next: typeof mode) { cancelOperation(); camera.current?.stop(); setMode(next); modeRef.current = next; setMessage(''); setRecords([]); setPhotos([]); setLast(null); setSignIn(false); if (next === 'camera') void camera.current?.start() }
  async function photo(file?: File) {
    if (!file || busy.current || !alive.current) return
    cancelOperation(); camera.current?.stop(); setMode('photo'); modeRef.current = 'photo'; const version = generation.current
    const controller = new AbortController(); request.current = controller
    busy.current = true; setWorking(true); setMessage('Reading photo on this device…'); setRecords([]); setPhotos([]); setLast(null)
    try {
      const decoder = await import('@/lib/qr-decode'), payloads = await decoder.decodeQrPhoto(file, controller.signal)
      if (!alive.current || version !== generation.current || document.visibilityState === 'hidden') return
      const distinct = new Map<string, PhotoChoice>()
      for (const payload of payloads) { const target = parseQrPayload(payload, allOrigins()); if (target) distinct.set(qrTargetKey(target), { payload, label: `${target.kind === 'location' ? 'Location' : target.kind === 'plant' ? 'Plant' : 'Accession'} · ${target.identifier}` }) }
      busy.current = false; setWorking(false)
      if (distinct.size === 1) void resolve([...distinct.values()][0].payload)
      else if (distinct.size > 1) { setPhotos([...distinct.values()]); setMessage('Several labels were found. Choose one to open.') }
      else setMessage(payloads.length ? 'This QR code is not a recognized AxilDB label.' : 'No QR code was found. Try a closer, sharper photo or enter the accession ID.')
    } catch (error) { if (alive.current && version === generation.current) setMessage(error instanceof Error && /Choose a JPEG|Photo scanning is unavailable/.test(error.message) ? error.message : 'We couldn’t read this photo. Try a JPEG or PNG, or use manual lookup.') }
    finally { if (version === generation.current) { busy.current = false; setWorking(false) } }
  }
  return createPortal(<dialog ref={dialog} className="ax-scanner-dialog" aria-labelledby="ax-scanner-title" aria-describedby="ax-scanner-instructions" onCancel={event => { event.preventDefault(); close() }}>
    <div className="flex items-start justify-between gap-3"><h2 id="ax-scanner-title" className="font-serif text-2xl font-bold">Scan a label</h2><button type="button" className="ax-scanner-control" aria-label="Close scanner" onClick={close}><X className="h-5 w-5" aria-hidden="true" /></button></div>
    <p id="ax-scanner-instructions" className="my-3 text-sm ax-text-muted">Position a plant or location QR code within the frame. Records open automatically.</p>
    <div className="ax-scanner-preview" hidden={mode !== 'camera'}>
      <video ref={video} playsInline muted autoPlay aria-label="Live camera preview" />
      <div className="ax-scanner-reticle" aria-hidden="true"><i /><i /><i /><i /></div>
      {cameraState.status === 'initializing' && <Loader2 className="absolute left-1/2 top-1/2 h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      <span className="sr-only">The whole camera image is scanned; the frame is an alignment guide.</span>
    </div>
    {mode === 'camera' && <div className="mt-2 flex items-center gap-2">
      <p className="min-w-0 flex-1 text-sm" role="status">{working ? 'Looking up label…' : cameraState.message}</p>
      {cameraState.torchSupported && cameraState.status === 'scanning' && <button type="button" className="ax-scanner-control" title="Flashlight" aria-label="Flashlight" aria-pressed={cameraState.torch} onClick={() => void camera.current?.toggleTorch()}><Flashlight className="h-5 w-5" aria-hidden="true" /></button>}
      {cameraState.canSwitch && cameraState.status === 'scanning' && <button type="button" className="ax-scanner-control" title="Switch camera" aria-label="Switch camera" onClick={() => camera.current?.switchCamera()}><SwitchCamera className="h-5 w-5" aria-hidden="true" /></button>}
    </div>}
    <div className="my-3 flex flex-wrap gap-2">
      <button type="button" className="ax-scanner-secondary" onClick={() => changeMode('camera')} disabled={working}><Camera className="h-4 w-4" aria-hidden="true" />{mode === 'camera' ? 'Restart camera' : 'Camera'}</button>
      <label className={`ax-scanner-secondary cursor-pointer ${working ? 'opacity-60' : ''}`}><ImagePlus className="h-4 w-4" aria-hidden="true" />Photo<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Scan QR code from photo" disabled={working} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void photo(file) }} /></label>
      <button type="button" className="ax-scanner-secondary" onClick={() => changeMode('manual')}>Enter accession ID manually</button>
    </div>
    {mode === 'manual' && <form className="my-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void resolve(manual, true) }}><label className="grid min-w-0 flex-1 gap-1 text-sm">Accession ID or location code<input className="ax-field min-h-11 min-w-0 rounded border px-3" maxLength={160} autoComplete="off" autoCapitalize="none" spellCheck={false} value={manual} onChange={event => setManual(event.target.value)} /></label><button className="ax-scanner-secondary self-end" disabled={working || !manual.trim()}>Open record</button></form>}
    {message && <p role="status" className="my-3 text-sm">{working && <Loader2 className="mr-2 inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{message}</p>}
    {signIn && <Link className="ax-scanner-secondary" href={`/login?next=${encodeURIComponent(currentPath)}`} onClick={close}>Sign in</Link>}
    {!working && last && message && !records.length && !signIn && <button className="ax-scanner-secondary" type="button" onClick={() => void resolve(last.payload, last.manual)}>Retry lookup</button>}
    {!!records.length && <ul className="grid gap-2">{records.map(record => <li key={record.href}><button type="button" className="ax-scanner-choice" onClick={() => found(record)}><Check className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 [overflow-wrap:anywhere]">{record.label}<small className="block ax-text-muted">{formatTypography(record.collectionName)}</small></span></button></li>)}</ul>}
    {!!photos.length && <ul className="grid gap-2">{photos.map(choice => <li key={choice.payload}><button type="button" className="ax-scanner-choice [overflow-wrap:anywhere]" onClick={() => void resolve(choice.payload)}>{choice.label}</button></li>)}</ul>}
    <p className="mt-4 text-xs ax-text-muted">Camera images and selected photos stay on this device. Scanning opens records; it does not record care.</p>
  </dialog>, document.body)
}
