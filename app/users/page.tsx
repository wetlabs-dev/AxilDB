import { createUser, deleteUser, resendVerificationEmail, updateUser } from '@/app/auth-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { AddPanel, Card, Field, Button } from '@/components/ui'
import { requireAdminUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{ emailStatus?: string }>
}) {
  const currentUser = await requireAdminUser()
  const sp = await searchParams
  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } })

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Users</h2>
      {sp.emailStatus === 'sent' && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Verification email sent.</p>}
      {sp.emailStatus === 'limited' && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Please wait a bit before requesting another verification email for that user.</p>}
      {sp.emailStatus === 'error' && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">AxilDB could not send the verification email. Check the audit log and app logs for details.</p>}
      <AddPanel label="Add user">
        <form action={createUser} className="grid max-w-4xl gap-x-3 gap-y-2 md:grid-cols-3">
          <Field label="Email" name="email" type="email" required />
          <Field label="Password" name="password" type="password" required />
          <label className="grid gap-1 text-sm font-medium">Role<select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="role"><option>LOGGER</option><option>ADMIN</option></select></label>
          <Button className="justify-self-start md:col-span-3">Add user</Button>
        </form>
      </AddPanel>

      <div className="grid gap-4">
        {users.map((user) => (
          <Card key={user.id}>
            <form action={updateUser} className="grid max-w-4xl gap-x-3 gap-y-2 md:grid-cols-3">
              <input type="hidden" name="id" value={user.id} />
              <Field label="Email" name="email" type="email" required defaultValue={user.email} />
              <Field label="New password" name="password" type="password" />
              <label className="grid gap-1 text-sm font-medium">Role<select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="role" defaultValue={user.role}><option>LOGGER</option><option>ADMIN</option></select></label>
              <Button className="justify-self-start md:col-span-3">Save user</Button>
            </form>
            <div className="mt-3 text-xs text-stone-600">
              Email {user.emailVerifiedAt ? `verified ${user.emailVerifiedAt.toLocaleDateString()}` : 'not verified'}
            </div>
            {!user.emailVerifiedAt && (
              <form action={resendVerificationEmail} className="mt-3">
                <input type="hidden" name="id" value={user.id} />
                <Button className="px-3 py-1.5 text-xs">Send verification email</Button>
              </form>
            )}
            {user.id !== currentUser.id && (
              <form action={deleteUser} className="mt-4 border-t pt-4">
                <input type="hidden" name="id" value={user.id} />
                <ConfirmDeleteButton title="Delete user?" message={`This will permanently delete ${user.email} and revoke their sessions.`} confirmLabel="Delete user">Delete user</ConfirmDeleteButton>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
