import { Card, LinkButton } from '@/components/ui'
import { audit } from '@/lib/auth'
import { consumeEmailToken, emailTokenPurposes } from '@/lib/email-tokens'
import { prisma } from '@/lib/prisma'

export default async function VerifyEmail({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = (await searchParams).token
  let verified = false
  let email = ''

  if (token) {
    const record = await consumeEmailToken(prisma, {
      token,
      purpose: emailTokenPurposes.emailVerification,
    })

    if (record) {
      const user = record.userId
        ? await prisma.user.update({
            where: { id: record.userId },
            data: { emailVerifiedAt: new Date() },
          })
        : null

      email = user?.email || record.email
      verified = true
      await audit(user ? { id: user.id, email: user.email, role: user.role } : null, 'VERIFY', 'EMAIL', record.id, `Verified email ${email}`)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h2 className="text-3xl font-bold">Email verification</h2>
      <Card>
        {verified ? (
          <>
            <p className="text-sm text-stone-700">{email} has been verified for AxilDB.</p>
            <LinkButton className="mt-4" href="/">Open dashboard</LinkButton>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-700">This verification link is missing, expired, or has already been used.</p>
            <LinkButton className="mt-4" href="/login">Return to sign in</LinkButton>
          </>
        )}
      </Card>
    </div>
  )
}
