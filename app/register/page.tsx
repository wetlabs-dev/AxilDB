import { registerViewer } from '@/app/auth-actions'
import { Button, Card, Field, LinkButton } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { pathWithNext, safeNextPath } from '@/lib/redirects'

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string; next?: string }>
}) {
  const sp = await searchParams
  const next = safeNextPath(sp.next)
  const user = await getCurrentUser()
  if (user) redirect(next)

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Create Viewer Account</h2>
        <p className="mt-1 text-stone-700">
          Viewer accounts can follow plant types, specimens, and lineages for update emails without changing collection records.
        </p>
      </div>

      <Card>
        {sp.error === 'exists' && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            An account with that email already exists. Try signing in or use password reset.
          </p>
        )}
        {sp.error === 'invalid' && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            Enter a valid email and a password at least 8 characters long.
          </p>
        )}
        <form action={registerViewer} className="grid gap-3">
          {sp.invite && <input type="hidden" name="invite" value={sp.invite} />}
          {next !== '/' && <input type="hidden" name="next" value={next} />}
          <Field label="Email" name="email" type="email" required />
          <Field label="Password" name="password" type="password" required minLength={8} />
          <Button>Create viewer account</Button>
        </form>
        <p className="mt-3 text-sm text-stone-600">
          Already have an account? <Link className="text-[#2f6b45] underline" href={pathWithNext('/login', next)}>Sign in</Link>.
        </p>
      </Card>

      <LinkButton href="/splash" className="bg-white/70 text-stone-800 hover:bg-white">
        Learn more about AxilDB
      </LinkButton>
    </div>
  )
}
