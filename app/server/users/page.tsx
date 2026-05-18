import { createUser, deleteUser, resendVerificationEmail, updateUser } from '@/app/auth-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { AddPanel, Button, Card, Field } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const roleOptions = ['USER', 'SERVER_ADMIN']

export default async function ServerUsers({
  searchParams,
}: {
  searchParams: Promise<{ emailStatus?: string }>
}) {
  const currentUser = await requireServerAdmin()
  const sp = await searchParams
  const users = await prisma.user.findMany({
    orderBy: { email: 'asc' },
    include: {
      memberships: {
        include: { collection: { select: { name: true, slug: true, status: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Site Users</h2>
        <p className="mt-1 text-sm text-stone-600">Server-admin-only user management and collection membership visibility.</p>
      </div>
      {sp.emailStatus === 'sent' && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Verification email sent.</p>}
      {sp.emailStatus === 'limited' && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Please wait a bit before requesting another verification email for that user.</p>}
      {sp.emailStatus === 'error' && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">AxilDB could not send the verification email. Check the audit log and app logs for details.</p>}

      <AddPanel label="Add user">
        <form action={createUser} className="grid max-w-4xl gap-x-3 gap-y-2 md:grid-cols-3">
          <Field label="Email" name="email" type="email" required />
          <Field label="Password" name="password" type="password" required />
          <label className="grid gap-1 text-sm font-medium">
            Global role
            <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="role" defaultValue="USER">
              {roleOptions.map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
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
              <label className="grid gap-1 text-sm font-medium">
                Global role
                <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="role" defaultValue={user.role}>
                  {roleOptions.map((role) => <option key={role}>{role}</option>)}
                </select>
              </label>
              <Button className="justify-self-start md:col-span-3">Save user</Button>
            </form>
            <div className="mt-3 text-xs text-stone-600">
              Email {user.emailVerifiedAt ? `verified ${user.emailVerifiedAt.toLocaleDateString()}` : 'not verified'}
            </div>
            {user.memberships.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {user.memberships.map((membership) => (
                  <span key={membership.id} className="rounded-full border border-stone-200 bg-white/60 px-2 py-1">
                    {membership.collection.name}: {membership.role.toLowerCase()} · {membership.status.toLowerCase()}
                  </span>
                ))}
              </div>
            )}
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
