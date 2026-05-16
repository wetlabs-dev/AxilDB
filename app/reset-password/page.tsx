import { resetPassword } from '@/app/auth-actions'
import { Button, Card, Field } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const user = await getCurrentUser()
  if (user) redirect('/')
  const sp = await searchParams

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h2 className="text-3xl font-bold">Choose a new password</h2>
      <Card>
        {sp.error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            That reset link is invalid, expired, already used, or the password was too short.
          </p>
        )}
        {!sp.token ? (
          <p className="text-sm text-stone-700">This reset link is missing a token. Request a fresh password reset email.</p>
        ) : (
          <form action={resetPassword} className="grid gap-3">
            <input type="hidden" name="token" value={sp.token} />
            <Field label="New password" name="password" type="password" minLength={8} required />
            <Button>Update password</Button>
          </form>
        )}
      </Card>
    </div>
  )
}
