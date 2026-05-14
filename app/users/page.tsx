import { createUser, deleteUser, updateUser } from '@/app/auth-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Card, Field, Button } from '@/components/ui'
import { requireAdminUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function Users() {
  const currentUser = await requireAdminUser()
  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } })

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Users</h2>
      <Card>
        <h3 className="mb-3 font-bold">Add user</h3>
        <form action={createUser} className="grid gap-3 md:grid-cols-3">
          <Field label="Email" name="email" type="email" required />
          <Field label="Password" name="password" type="password" required />
          <label className="grid gap-1 text-sm font-medium">Role<select className="rounded-lg border px-3 py-2 font-normal" name="role"><option>LOGGER</option><option>ADMIN</option></select></label>
          <Button className="md:col-span-3">Add user</Button>
        </form>
      </Card>

      <div className="grid gap-4">
        {users.map((user) => (
          <Card key={user.id}>
            <form action={updateUser} className="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={user.id} />
              <Field label="Email" name="email" type="email" required defaultValue={user.email} />
              <Field label="New password" name="password" type="password" />
              <label className="grid gap-1 text-sm font-medium">Role<select className="rounded-lg border px-3 py-2 font-normal" name="role" defaultValue={user.role}><option>LOGGER</option><option>ADMIN</option></select></label>
              <Button className="md:col-span-3">Save user</Button>
            </form>
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
