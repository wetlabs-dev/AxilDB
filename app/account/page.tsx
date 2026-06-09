import { resendOwnVerificationEmail, updateAccount, updateEmailPreferences } from '@/app/auth-actions'
import { resolveImageModerationReview } from '@/app/actions'
import Link from 'next/link'
import { PlantImage } from '@/components/PlantImage'
import { PlantIdentificationHistoryList } from '@/components/PlantIdentificationHistoryList'
import { Card, Field, Button } from '@/components/ui'
import { PushNotificationSettings } from '@/components/PushNotificationSettings'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { collectionRoleAtLeast, isServerAdminRole } from '@/lib/roles'
import { resolveSunshineTarget } from '@/lib/sunshine'
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
    ['sunshineNotifications', 'sunshineNotificationsPushEnabled', 'Sunshine received', preferences?.sunshineNotifications ?? false, preferences?.sunshineNotificationsPushEnabled ?? false],
    ['collectionUpdateDigestEmailEnabled', 'collectionUpdateDigestPushEnabled', 'Collection update digest', preferences?.collectionUpdateDigestEmailEnabled ?? true, preferences?.collectionUpdateDigestPushEnabled ?? false],
    ['careQueueDigestEmailEnabled', 'careQueueDigestPushEnabled', 'Care queue digest', preferences?.careQueueDigestEmailEnabled ?? true, preferences?.careQueueDigestPushEnabled ?? false],
    ['serverHealthEmailEnabled', 'serverHealthPushEnabled', 'Server health alerts', preferences?.serverHealthEmailEnabled ?? true, preferences?.serverHealthPushEnabled ?? false],
  ] as const
  const sunshineRows = await prisma.sunshine.findMany({
    where: { userId: user.id },
    include: { collection: { select: { id: true, slug: true, name: true, status: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const sunshineHistory = (await Promise.all(sunshineRows.map(async (row) => {
    if (row.collection.status !== 'ACTIVE') return null
    const target = await resolveSunshineTarget(prisma, row.collectionId, row.collection.slug, row.targetType, row.targetId)
    return target ? { id: row.id, createdAt: row.createdAt, collectionName: row.collection.name, target } : null
  }))).filter(Boolean)
  const imageReviewItems = await prisma.imageModerationReview.findMany({
    where: {
      uploaderUserId: user.id,
      reviewType: { in: ['NO_PLANT_DETECTED', 'UNCERTAIN_PLANT_CONTENT'] },
      status: 'PENDING',
    },
    include: {
      photo: true,
      collection: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  const plantIdentificationLogs = await prisma.plantIdentificationLog.findMany({
    where: { userId: user.id },
    include: {
      collection: { select: { id: true, name: true, slug: true } },
      uploadedPhoto: true,
      matchedPlantDefinition: true,
      createdPlantDefinition: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const identificationCollectionIds = Array.from(new Set(plantIdentificationLogs.map((log) => log.collectionId)))
  const identificationMemberships = identificationCollectionIds.length
    ? await prisma.collectionMembership.findMany({
        where: { collectionId: { in: identificationCollectionIds }, userId: user.id, status: 'ACTIVE' },
        select: { collectionId: true, role: true },
      })
    : []
  const identificationMembershipByCollection = new Map(identificationMemberships.map((membership) => [membership.collectionId, membership]))
  const identificationLogsByCollection = new Map<string, typeof plantIdentificationLogs>()
  for (const log of plantIdentificationLogs) {
    const rows = identificationLogsByCollection.get(log.collectionId) || []
    rows.push(log)
    identificationLogsByCollection.set(log.collectionId, rows)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Account</h2>
      {imageReviewItems.length > 0 && (
        <Card className="border-[color:var(--ax-border-strong)] bg-[var(--ax-surface-solid)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-[var(--ax-heading)]">Image review needed</h3>
              <p className="mt-1 text-sm text-[var(--ax-muted-strong)]">Review uploaded images where AxilDB did not clearly detect plant content.</p>
            </div>
            <span className="rounded-full border border-[color:var(--ax-border-strong)] bg-[var(--ax-warning-soft)] px-3 py-1 text-sm font-semibold text-[var(--ax-warning)]">{imageReviewItems.length} pending</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {imageReviewItems.map((item) => {
              const uncertain = item.reviewType === 'UNCERTAIN_PLANT_CONTENT'
              return (
                <div key={item.id} className="grid gap-3 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 sm:grid-cols-[6rem_minmax(0,1fr)]">
                  <div className="aspect-square overflow-hidden rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-primary-wash)]">
                    <PlantImage src={item.photo} alt={item.photo.caption || 'Uploaded image'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ax-heading)]">{item.collection?.name || 'Collection image'}</p>
                    <p className="mt-1 text-sm text-[var(--ax-text)]">
                      {uncertain
                        ? "We're not sure this image contains a plant. Continue anyway?"
                        : 'No plant detected. Are you sure this is the image you wanted to upload?'}
                    </p>
                    {item.photo.caption && <p className="mt-1 line-clamp-2 text-sm text-[var(--ax-text)]">{item.photo.caption}</p>}
                    {item.reason && <p className="mt-1 text-xs text-[var(--ax-warning)]">Review note: {item.reason}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={resolveImageModerationReview}>
                        <input type="hidden" name="reviewId" value={item.id} />
                        <input type="hidden" name="action" value="USER_CONFIRMED" />
                        <input type="hidden" name="back" value="/account" />
                        <Button className="px-3 py-1.5 text-xs">Yes, keep it</Button>
                      </form>
                      <form action={resolveImageModerationReview}>
                        <input type="hidden" name="reviewId" value={item.id} />
                        <input type="hidden" name="action" value="REMOVE" />
                        <input type="hidden" name="back" value="/account" />
                        <Button className="bg-[#9a3f35] px-3 py-1.5 text-xs hover:bg-[#7d3028]">Remove image</Button>
                      </form>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
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
        <p className="mt-1 text-sm text-[var(--ax-muted)]">Choose which AxilDB email and push alerts should reach you.</p>
        <form action={updateEmailPreferences} className="mt-4 grid max-w-3xl gap-3">
          <Field label="Timezone" name="timezone" defaultValue={preferences?.timezone || defaultTimeZone()} />
          <div className="grid gap-2">
            {[
              ['authSecurityEmails', 'Account security emails', preferences?.authSecurityEmails ?? true],
              ['welcomeEmails', 'Welcome and onboarding emails', preferences?.welcomeEmails ?? true],
              ['transferNotifications', 'Collection transfer workflow emails', preferences?.transferNotifications ?? true],
            ].map(([name, label, checked]) => (
              <label key={String(name)} className="flex items-center gap-2 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-3 py-2 text-sm text-[var(--ax-text)]">
                <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-[color:var(--ax-border)]">
            <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-2 bg-[var(--ax-surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--ax-muted)]">
              <span>Alert type</span>
              <span>Email</span>
              <span>Push</span>
            </div>
            {notificationRows.map(([emailName, pushName, label, emailChecked, pushChecked]) => (
              <div key={emailName} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 border-t border-[color:var(--ax-border)] bg-[var(--ax-surface)] px-3 py-2 text-sm text-[var(--ax-text)]">
                <span>{label}</span>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" name={emailName} defaultChecked={Boolean(emailChecked)} />
                  <span className="sr-only">Email</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  {pushName ? (
                    <>
                      <input type="checkbox" name={pushName} defaultChecked={Boolean(pushChecked)} />
                      <span className="sr-only">Push</span>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--ax-muted)]">—</span>
                  )}
                </label>
              </div>
            ))}
          </div>
          <Field
            label="Daily care digest time"
            help="Local time to send the daily care queue digest by email and/or push when due care exists."
            name="careQueueDigestSendTime"
            type="time"
            defaultValue={preferences?.careQueueDigestSendTime || '08:00'}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quiet hours start" name="quietHoursStart" type="time" defaultValue={preferences?.quietHoursStart || ''} />
            <Field label="Quiet hours end" name="quietHoursEnd" type="time" defaultValue={preferences?.quietHoursEnd || ''} />
          </div>
          <Button className="justify-self-start">Save notification preferences</Button>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold">My Plant IDs</h3>
        <p className="mt-1 text-sm text-[var(--ax-muted)]">A private notebook of ID My Plant suggestions you have run. Collection managers can also see entries for their collection.</p>
        <div className="mt-4 grid gap-4">
          {plantIdentificationLogs.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No ID My Plant history yet.</p>}
          {Array.from(identificationLogsByCollection.entries()).map(([collectionId, logs]) => {
            const collection = logs[0].collection
            const membership = identificationMembershipByCollection.get(collectionId)
            const canCreateDefinitions = isServerAdminRole(user.role) || collectionRoleAtLeast(membership?.role, 'LOGGER')
            return (
              <div key={collectionId} className="grid gap-3">
                <div>
                  <h4 className="font-serif text-lg font-semibold">{collection.name}</h4>
                  <p className="text-xs text-[var(--ax-muted)]">/{collection.slug}</p>
                </div>
                <PlantIdentificationHistoryList
                  logs={logs}
                  collectionSlug={collection.slug}
                  timezone={preferences?.timezone}
                  canCreateDefinitions={canCreateDefinitions}
                />
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">Web Push devices</h3>
        <p className="mt-1 text-sm text-[var(--ax-muted)]">Enable browser or installed PWA push notifications for the push alert types selected above.</p>
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

      <Card>
        <h3 className="font-bold">Your sunshine history</h3>
        <p className="mt-1 text-sm text-[var(--ax-muted)]">A private list of records you have appreciated. Other users only see counts.</p>
        <div className="mt-4 grid gap-2">
          {sunshineHistory.length === 0 && <p className="text-sm text-stone-600">No sunshine given yet.</p>}
          {sunshineHistory.map((item) => item && (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-3 py-2 text-sm">
              <div className="min-w-0">
                <Link href={item.target.href} className="font-semibold text-[var(--ax-primary)] underline underline-offset-2">
                  {item.target.label}
                </Link>
                <p className="text-xs text-[var(--ax-muted)]">
                  {item.collectionName} · {formatDate(item.createdAt, preferences?.timezone)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
