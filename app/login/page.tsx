import { login, requestMagicLogin } from '@/app/auth-actions'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, Field, Button } from '@/components/ui'
import Link from 'next/link'

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string; magic?: string; magicError?: string }> }) {
  const user = await getCurrentUser()
  if (user) redirect('/')
  const sp = await searchParams

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h2 className="text-3xl font-bold">Sign in</h2>
      <Card>
        {sp.error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">Invalid email or password.</p>}
        {sp.reset && <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Password updated. You can sign in with the new password.</p>}
        {sp.magic === 'sent' && <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">If that account exists, a sign-in link has been emailed.</p>}
        {sp.magic === 'expired' && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">That sign-in link is expired or has already been used.</p>}
        <form action={login} className="grid gap-3">
          <Field label="Email" name="email" type="email" required />
          <Field label="Password" name="password" type="password" required />
          <Button>Sign in</Button>
        </form>
        <div className="mt-3 text-sm">
          <Link className="text-[#2f6b45] underline" href="/forgot-password">Forgot password?</Link>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">Email me a sign-in link</h3>
        <p className="mt-1 text-sm text-stone-600">Use a single-use magic link instead of a password.</p>
        <form action={requestMagicLogin} className="mt-3 grid gap-3">
          <Field label="Email" name="email" type="email" required />
          <Button>Send sign-in link</Button>
        </form>
      </Card>
    </div>
  )
}
