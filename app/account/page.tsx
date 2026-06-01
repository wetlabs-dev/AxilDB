import { resendOwnVerificationEmail, updateAccount, updateEmailPreferences } from '@/app/auth-actions'
import Link from 'next/link'
import { Card, Field, Button } from '@/components/ui'
import { PushNotificationSettings } from '@/components/PushNotificationSettings'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { defaultTimeZone, formatDate } from '@/lib/time'

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ emailStatus?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      emailPreference: true,
      twoFactor: true,
      pushSubscriptions: {
        where: { revokedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          endpoint: true,
          deviceLabel: true,
          userAgent: true,
          enabled: true,
          createdAt: true,
          lastSeenAt: true,
        },
      },
    },
  })
  const preferences = account?.emailPreference
  const notificationRows = [
    ['generalReminders', 'generalRemindersPushEnabled', 'General reminders', preferences?.generalReminders ?? true, preferences?.generalRemindersPushEnabled ?? false],
    ['plantCheckInReminders', 'plantCheckInRemindersPushEnabled', 'Plant check-in reminders', preferences?.plantCheckInReminders ?? true, preferences?.plantCheckInRemindersPushEnabled ?? false],
    ['bloomCycleReminders', 'bloomCycleRemindersPushEnabled', 'Bloom-cycle reminders', preferences?.bloomCycleReminders ?? true, preferences?.bloomCycleRemindersPushEnabled ?? false],
    ['propagationFollowUps', 'propagationFollowUpsPushEnabled', 'Propagation follow-up reminders', preferences?.propagationFollowUps ?? true, preferences?.propagationFollowUpsPushEnabled ?? false],
    ['followNotifications', 'followNotificationsPushEnabled', 'Followed plant updates', preferences?.followNotifications ?? true, preferences?.followNotificationsPushEnabled ?? false],
    ['careQueueDigestEmailEnabled', 'careQueueDigestPushEnabled', 'Care queue digest', preferences?.careQueueDigestEmailEnabled ?? true, preferences?.careQueueDigestPushEnabled ?? false],
    ['serverHealthEmailEnabled', 'serverHealthPushEnabled', 'Server health alerts', preferences?.serverHealthEmailEnabled ?? true, preferences?.serverHealthPushEnabled ?? false],
  ] as const

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Account</h2>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-700">
          <span>Two-factor authentication: {account?.twoFactor?.enabledAt ? 'enabled' : 'not enabled'}</span>
          <Link href="/account/security" className="rounded-md border border-stone-300 bg-white/60 px-3 py-1.5 text-xs font-medium text-stone-900 hover:bg-[#f5f0e2]">
            Manage security
          </Link>
        </div>
        {sp.emailStatus === 'sent' && <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Verification email sent.</p>}
        {sp.emailStatus === 'limited' && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Please wait a bit before requesting another verification email.</p>}
        {sp.emailStatus === 'error' && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">AxilDB could not send the verification email. Check the audit log and app logs for details.</p>}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-700">
          <span>Email status: {account?.emailVerifiedAt ? `verified ${formatDate(account.emailVerifiedAt, preferences?.timezone)}` : 'not verified yet'}</span>
          {!account?.emailVerifiedAt && (
            <form action={resendOwnVerificationEmail}>
              <Button className="px-3 py-1.5 text-xs">Resend verification</Button>
            </form>
          )}
        </div>
        <form action={updateAccount} className="grid max-w-2xl gap-x-3 gap-y-2 md:grid-cols-2">
          <Field label="Email" name="email" type="email" required defaultValue={user.email} />
          <Field label="New password" name="password" type="password" />
          <Button className="justify-self-start md:col-span-2">Save account settings</Button>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold">Notification preferences</h3>
        <p className="mt-1 text-sm text-stone-600">Choose which AxilDB email and push alerts should reach you.</p>
        <form action={updateEmailPreferences} className="mt-4 grid max-w-3xl gap-3">
          <Field label="Timezone" name="timezone" defaultValue={preferences?.timezone || defaultTimeZone()} />
          <div className="grid gap-2">
            {[
              ['authSecurityEmails', 'Account security emails', preferences?.authSecurityEmails ?? true],
              ['welcomeEmails', 'Welcome and onboarding emails', preferences?.welcomeEmails ?? true],
              ['transferNotifications', 'Collection transfer workflow emails', preferences?.transferNotifications ?? true],
            ].map(([name, label, checked]) => (
              <label key={String(name)} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white/50 px-3 py-2 text-sm">
                <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-stone-200">
            <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-2 bg-white/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <span>Alert type</span>
              <span>Email</span>
              <span>Push</span>
            </div>
            {notificationRows.map(([emailName, pushName, label, emailChecked, pushChecked]) => (
              <div key={emailName} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 border-t border-stone-200 bg-white/40 px-3 py-2 text-sm">
                <span>{label}</span>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" name={emailName} defaultChecked={Boolean(emailChecked)} />
                  <span className="sr-only">Email</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" name={pushName} defaultChecked={Boolean(pushChecked)} />
                  <span className="sr-only">Push</span>
                </label>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quiet hours start" name="quietHoursStart" type="time" defaultValue={preferences?.quietHoursStart || ''} />
            <Field label="Quiet hours end" name="quietHoursEnd" type="time" defaultValue={preferences?.quietHoursEnd || ''} />
          </div>
          <Button className="justify-self-start">Save notification preferences</Button>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold">Web Push devices</h3>
        <p className="mt-1 text-sm text-stone-600">Enable browser or installed PWA push notifications for the push alert types selected above.</p>
        <PushNotificationSettings
          enabled={process.env.NEXT_PUBLIC_ENABLE_WEB_PUSH === 'true'}
          publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''}
          devices={(account?.pushSubscriptions || []).map((subscription) => ({
            ...subscription,
            createdAt: subscription.createdAt.toISOString(),
            lastSeenAt: subscription.lastSeenAt?.toISOString() || null,
          }))}
        />
      </Card>
    </div>
  )
}
