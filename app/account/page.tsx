import { resendOwnVerificationEmail, updateAccount, updateEmailPreferences } from '@/app/auth-actions'
import { Card, Field, Button } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ emailStatus?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    include: { emailPreference: true },
  })
  const preferences = account?.emailPreference

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Account</h2>
      <Card>
        {sp.emailStatus === 'sent' && <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Verification email sent.</p>}
        {sp.emailStatus === 'limited' && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Please wait a bit before requesting another verification email.</p>}
        {sp.emailStatus === 'error' && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">AxilDB could not send the verification email. Check the audit log and app logs for details.</p>}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-700">
          <span>Email status: {account?.emailVerifiedAt ? `verified ${account.emailVerifiedAt.toLocaleDateString()}` : 'not verified yet'}</span>
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
        <h3 className="font-bold">Email preferences</h3>
        <p className="mt-1 text-sm text-stone-600">Choose which AxilDB emails should reach you once reminders and scheduled mail are enabled.</p>
        <form action={updateEmailPreferences} className="mt-4 grid max-w-3xl gap-3">
          <Field label="Timezone" name="timezone" defaultValue={preferences?.timezone || 'America/New_York'} />
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['authSecurityEmails', 'Account security emails', preferences?.authSecurityEmails ?? true],
              ['welcomeEmails', 'Welcome and onboarding emails', preferences?.welcomeEmails ?? true],
              ['generalReminders', 'General reminder emails', preferences?.generalReminders ?? true],
              ['plantCheckInReminders', 'Plant check-in reminders', preferences?.plantCheckInReminders ?? true],
              ['bloomCycleReminders', 'Bloom-cycle reminders', preferences?.bloomCycleReminders ?? true],
              ['propagationFollowUps', 'Propagation follow-up reminders', preferences?.propagationFollowUps ?? true],
              ['followNotifications', 'Followed plant update emails', preferences?.followNotifications ?? true],
            ].map(([name, label, checked]) => (
              <label key={String(name)} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white/50 px-3 py-2 text-sm">
                <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quiet hours start" name="quietHoursStart" type="time" defaultValue={preferences?.quietHoursStart || ''} />
            <Field label="Quiet hours end" name="quietHoursEnd" type="time" defaultValue={preferences?.quietHoursEnd || ''} />
          </div>
          <Button className="justify-self-start">Save email preferences</Button>
        </form>
      </Card>
    </div>
  )
}
