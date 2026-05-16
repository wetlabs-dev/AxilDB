import { updateAccount, updateEmailPreferences } from '@/app/auth-actions'
import { Card, Field, Button } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function Account() {
  const user = await requireUser()
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    include: { emailPreference: true },
  })
  const preferences = account?.emailPreference

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Account</h2>
      <Card>
        <div className="mb-4 rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-700">
          Email status: {account?.emailVerifiedAt ? `verified ${account.emailVerifiedAt.toLocaleDateString()}` : 'not verified yet'}
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
