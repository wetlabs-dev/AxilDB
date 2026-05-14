import { login } from '@/app/auth-actions'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, Field, Button } from '@/components/ui'

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser()
  if (user) redirect('/')
  const sp = await searchParams

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h2 className="text-3xl font-bold">Sign in</h2>
      <Card>
        {sp.error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">Invalid email or password.</p>}
        <form action={login} className="grid gap-3">
          <Field label="Email" name="email" type="email" required />
          <Field label="Password" name="password" type="password" required />
          <Button>Sign in</Button>
        </form>
      </Card>
    </div>
  )
}
