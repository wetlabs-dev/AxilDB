import { requestPasswordReset } from '@/app/auth-actions'
import { Button, Card, Field } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const user = await getCurrentUser()
  if (user) redirect('/')
  const sp = await searchParams

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h2 className="text-3xl font-bold">Reset password</h2>
      <Card>
        {sp.sent && (
          <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            If that account exists, a password reset link has been emailed.
          </p>
        )}
        <form action={requestPasswordReset} className="grid gap-3">
          <Field label="Email" name="email" type="email" required />
          <Button>Send reset link</Button>
        </form>
      </Card>
    </div>
  )
}
