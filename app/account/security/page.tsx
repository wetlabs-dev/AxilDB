import QRCode from 'qrcode'
import { confirmTwoFactorSetup, dismissRecoveryCodes, regenerateRecoveryCodes, resetTwoFactorSetup } from '@/app/auth-actions'
import { Button, Card, Field } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptRecoveryCodes, decryptTotpSecret, encryptTotpSecret, generateTotpSecret, totpProvisioningUri } from '@/lib/totp'

export default async function AccountSecurity({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; twoFactor?: string; recoveryCodes?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams
  let setup = await prisma.userTwoFactor.findUnique({
    where: { userId: user.id },
    include: { recoveryCodes: { where: { usedAt: null }, select: { id: true } } },
  })

  if (!setup) {
    const secret = generateTotpSecret()
    setup = await prisma.userTwoFactor.create({
      data: { userId: user.id, secretCiphertext: encryptTotpSecret(secret) },
      include: { recoveryCodes: { where: { usedAt: null }, select: { id: true } } },
    })
  }

  const enabled = Boolean(setup.enabledAt)
  if (enabled && user.role === 'SERVER_ADMIN' && !user.twoFactorVerifiedAt) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold">Account security</h2>
        <Card className="max-w-xl">
          <h3 className="font-bold">Two-factor verification required</h3>
          <p className="mt-2 text-sm text-stone-700">Sign in again and enter your verification code before changing two-factor settings.</p>
        </Card>
      </div>
    )
  }
  const secret = decryptTotpSecret(setup.secretCiphertext)
  const qrCode = enabled ? null : await QRCode.toDataURL(totpProvisioningUri(user.email, secret), { margin: 1, width: 240 })
  const recoveryCodes = decryptRecoveryCodes(setup.recoveryCodesCiphertext)
  const unusedRecoveryCount = setup.recoveryCodes.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Account security</h2>
        <p className="mt-1 text-sm text-stone-600">Protect admin access with a rotating verification code.</p>
      </div>

      {sp.setup === 'required' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Admin accounts must enable two-factor authentication before using admin tools.
        </p>
      )}
      {sp.twoFactor === 'enabled' && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          Two-factor authentication is enabled.
        </p>
      )}
      {sp.twoFactor === 'invalid' && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          That verification code did not match. Scan the QR code and try the current 6-digit code.
        </p>
      )}
      {sp.twoFactor === 'reset' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Your two-factor setup was reset. Scan the new QR code to enable it again.
        </p>
      )}
      {sp.recoveryCodes === 'generated' && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          New recovery codes generated. Save them somewhere safe before dismissing them.
        </p>
      )}

      <Card className="max-w-3xl">
        <h3 className="font-bold">Authenticator app</h3>
        {enabled ? (
          <div className="mt-3 grid gap-4 text-sm text-stone-700">
            <p>Two-factor authentication is active for {user.email}. Admin sign-ins now require a verification code.</p>
            <p>{unusedRecoveryCount} unused recovery code{unusedRecoveryCount === 1 ? '' : 's'} remaining.</p>
            <form action={resetTwoFactorSetup}>
              <Button className="bg-amber-700 hover:bg-amber-800">Reset QR setup</Button>
            </form>
          </div>
        ) : (
          <div className="mt-4 grid gap-5 md:grid-cols-[16rem_1fr]">
            <div className="rounded-lg border border-stone-200 bg-white p-3">
              {qrCode && <img src={qrCode} alt="Two-factor QR code" className="mx-auto h-56 w-56" />}
            </div>
            <div className="grid content-start gap-4">
              <div className="text-sm text-stone-700">
                <p>Scan this QR code with Apple Passwords:</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Open Passwords and choose AxilDB or create a new login.</li>
                  <li>Add a verification code, then scan this QR code.</li>
                  <li>Enter the current 6-digit code below to finish setup.</li>
                </ol>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-[#2f6b45]">Enter setup key manually</summary>
                <code className="mt-2 block overflow-auto rounded-md border border-stone-200 bg-white/70 p-2 text-xs">{secret}</code>
              </details>
              <form action={confirmTwoFactorSetup} className="grid gap-3">
                <Field
                  label="Verification code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  required
                  className="max-w-xs text-lg tracking-[0.2em]"
                />
                <Button className="justify-self-start">Enable two-factor authentication</Button>
              </form>
            </div>
          </div>
        )}
      </Card>

      {enabled && (
        <Card className="max-w-3xl">
          <h3 className="font-bold">Recovery codes</h3>
          <p className="mt-1 text-sm text-stone-600">
            Recovery codes are one-time backup codes for signing in if your authenticator is unavailable.
          </p>
          {recoveryCodes.length > 0 ? (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-950">Save these codes now. They will not be shown after you dismiss this box.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {recoveryCodes.map((recoveryCode) => (
                    <code key={recoveryCode} className="rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-sm tracking-[0.12em] text-stone-900">
                      {recoveryCode}
                    </code>
                  ))}
                </div>
              </div>
              <form action={dismissRecoveryCodes}>
                <Button>I've saved these recovery codes</Button>
              </form>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 text-sm text-stone-700">
              <p>{unusedRecoveryCount} unused recovery code{unusedRecoveryCount === 1 ? '' : 's'} remaining.</p>
              <form action={regenerateRecoveryCodes}>
                <Button className="justify-self-start">Generate new recovery codes</Button>
              </form>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
