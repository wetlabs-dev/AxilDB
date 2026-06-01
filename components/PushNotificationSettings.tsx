'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui'

type Device = {
  id: string
  endpoint: string
  deviceLabel: string | null
  userAgent: string | null
  enabled: boolean
  createdAt: Date | string
  lastSeenAt: Date | string | null
}

type Props = {
  enabled: boolean
  publicKey: string
  devices: Device[]
}

function base64UrlToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

function deviceName(userAgent?: string | null) {
  if (!userAgent) return 'Browser device'
  if (/iphone|ipad/i.test(userAgent)) return 'iPhone or iPad PWA'
  if (/android/i.test(userAgent)) return 'Android browser'
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac browser'
  if (/windows/i.test(userAgent)) return 'Windows browser'
  return 'Browser device'
}

export function PushNotificationSettings({ enabled, publicKey, devices }: Props) {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)
  const [registeredDevices, setRegisteredDevices] = useState(devices)

  const currentEnabled = useMemo(
    () => registeredDevices.some((device) => device.enabled && device.endpoint === currentEndpoint),
    [registeredDevices, currentEndpoint],
  )

  useEffect(() => {
    const browserSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(browserSupported)
    if ('Notification' in window) setPermission(Notification.permission)
    if (!browserSupported || !enabled || !publicKey) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        setCurrentEndpoint(subscription?.endpoint || null)
        if (subscription?.endpoint) {
          fetch('/api/push-subscriptions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          }).catch(() => undefined)
        }
      })
      .catch(() => setMessage('AxilDB could not register the push service worker in this browser.'))
  }, [enabled, publicKey])

  async function enablePush() {
    setBusy(true)
    setMessage('')
    try {
      if (!enabled || !publicKey) throw new Error('Web Push is not enabled on this server.')
      if (!supported) throw new Error('This browser does not support Web Push notifications.')
      if (!window.isSecureContext) throw new Error('Web Push requires HTTPS, except on localhost during development.')
      if (permission === 'denied') throw new Error('Notifications are blocked in this browser. Update the browser or site settings before enabling push.')

      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') throw new Error('Notification permission was not granted.')

      const registration = await navigator.serviceWorker.register('/sw.js')
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey),
        }))

      const response = await fetch('/api/push-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!response.ok) throw new Error('AxilDB could not save this push subscription.')
      const result = await response.json()
      setCurrentEndpoint(subscription.endpoint)
      setRegisteredDevices((current) => {
        const next = current.filter((device) => device.endpoint !== subscription.endpoint)
        return [{ ...result.subscription, userAgent: navigator.userAgent, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() }, ...next]
      })
      setMessage('Push notifications are enabled for this browser.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function disablePush() {
    setBusy(true)
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await fetch('/api/push-subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe()
      }
      setCurrentEndpoint(null)
      if (subscription?.endpoint) {
        setRegisteredDevices((current) => current.map((device) => device.endpoint === subscription.endpoint ? { ...device, enabled: false } : device))
      }
      setMessage('Push notifications are disabled for this browser.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/push-subscriptions/test', { method: 'POST' })
      if (!response.ok) throw new Error('AxilDB could not send a test notification.')
      const result = await response.json()
      setMessage(result.sent > 0 ? 'Test notification sent.' : 'No enabled push device was ready for a test notification.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 grid gap-4">
      <div className="rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 text-sm text-[var(--ax-text)]">
        <p>Web Push support: {supported ? 'supported in this browser' : 'not supported in this browser'}</p>
        <p>Notification permission: {permission === 'default' ? 'not requested' : permission}</p>
        {!enabled && <p className="mt-2 text-[var(--ax-warning)]">Web Push is disabled on this AxilDB server.</p>}
        {permission === 'denied' && <p className="mt-2 text-[var(--ax-warning)]">Notifications are blocked in this browser. Change the site permission before enabling push.</p>}
        <p className="mt-2 text-[var(--ax-muted)]">On iPhone and iPad, push notifications require AxilDB to be added to the Home Screen first.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={enablePush} disabled={busy}>
          Enable push notifications
        </Button>
        <Button type="button" className="border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] text-[var(--ax-text)] hover:bg-[var(--ax-primary-wash)]" onClick={disablePush} disabled={busy || !currentEndpoint}>
          Disable push notifications
        </Button>
        <Button type="button" className="border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] text-[var(--ax-text)] hover:bg-[var(--ax-primary-wash)]" onClick={sendTest} disabled={busy || !enabled || !currentEnabled}>
          Send test push notification
        </Button>
      </div>

      {message && <p className="rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 text-sm text-[var(--ax-text)]">{message}</p>}

      <div>
        <h4 className="text-sm font-semibold">Registered devices</h4>
        {registeredDevices.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--ax-muted)]">No push devices are registered yet.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {registeredDevices.map((device) => (
              <li key={device.id} className="rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{device.deviceLabel || deviceName(device.userAgent)}</span>
                  <span className={device.enabled ? 'text-green-800' : 'text-[var(--ax-muted)]'}>{device.enabled ? 'enabled' : 'disabled'}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--ax-muted)]">
                  Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'not yet'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
