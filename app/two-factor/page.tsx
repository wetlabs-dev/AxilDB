import { verifyTwoFactorLogin } from '@/app/auth-actions'
import { Button, Card, Field } from '@/components/ui'
import { getTwoFactorChallenge } from '@/lib/auth'
import { pathWithNext, safeNextPath } from '@/lib/redirects'
import { redirect } from 'next/navigation'

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const sp = await searchParams
  const next = safeNextPath(sp.next)
  const challenge = await getTwoFactorChallenge()
  if (!challenge) redirect(pathWithNext('/login?twoFactor=expired', next))

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md content-center">
      <Card>
        <h2 className="font-serif text-2xl font-bold">Two-factor verification</h2>
        <p className="mt-2 text-sm text-stone-600">Enter the 6-digit code from Apple Passwords, or use one of your saved recovery codes.</p>
        {sp.error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            That code did not match. Try the current code from your authenticator.
          </p>
        )}
        <form action={verifyTwoFactorLogin} className="mt-5 grid gap-3">
          {next !== '/' && <input type="hidden" name="next" value={next} />}
          <Field
            label="Verification or recovery code"
            name="code"
            autoComplete="one-time-code"
            pattern="[A-Za-z0-9 -]*"
            required
            className="text-lg tracking-[0.2em]"
          />
          <Button>Verify and sign in</Button>
        </form>
      </Card>
    </div>
  )
}
