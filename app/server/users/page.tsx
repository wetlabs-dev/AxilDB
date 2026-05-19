import { createUser, deleteUser, resendVerificationEmail, serverAddUserMembership, serverRemoveMembership, serverUpdateMembership, updateUser } from '@/app/auth-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { AddPanel, Button, Card, Field, Select } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { collectionRoleLabel } from '@/lib/roles'

const roleOptions = ['USER', 'SERVER_ADMIN']
const collectionRoleOptions = ['VIEWER', 'LOGGER', 'GARDENER', 'MANAGER']
const membershipStatusOptions = ['PENDING', 'ACTIVE', 'REJECTED']

export default async function ServerUsers({
  searchParams,
}: {
  searchParams: Promise<{ emailStatus?: string }>
}) {
  const currentUser = await requireServerAdmin()
  const sp = await searchParams
  const [users, collections] = await Promise.all([
    prisma.user.findMany({
      orderBy: { email: 'asc' },
      include: {
        memberships: {
          include: { collection: { select: { id: true, name: true, slug: true, status: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.collection.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, status: true },
    }),
  ])

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
        {users.map((user) => {
          const memberCollectionIds = new Set(user.memberships.map((membership) => membership.collection.id))
          const availableCollections = collections.filter((collection) => !memberCollectionIds.has(collection.id))

          return (
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
              <div className="mt-4 rounded-lg border border-stone-200 bg-white/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Collection memberships</h3>
                  <span className="text-xs text-stone-500">{user.memberships.length} active or pending record{user.memberships.length === 1 ? '' : 's'}</span>
                </div>
                {user.memberships.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {user.memberships.map((membership) => (
                      <div key={membership.id} className="grid gap-2 rounded-md border border-stone-200 bg-[#fffdf7] p-2 md:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto_auto] md:items-end">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{membership.collection.name}</div>
                          <div className="text-xs text-stone-500">
                            /{membership.collection.slug} · {membership.collection.status.toLowerCase()} · {collectionRoleLabel(membership.role)}
                          </div>
                        </div>
                        <form id={`membership-${membership.id}`} action={serverUpdateMembership} className="contents">
                          <input type="hidden" name="membershipId" value={membership.id} />
                          <Select label="Role" name="role" defaultValue={membership.role}>
                            {collectionRoleOptions.map((role) => <option key={role}>{role}</option>)}
                          </Select>
                          <Select label="Status" name="status" defaultValue={membership.status}>
                            {membershipStatusOptions.map((status) => <option key={status}>{status}</option>)}
                          </Select>
                        </form>
                        <Button form={`membership-${membership.id}`} className="px-3 py-1.5 text-xs">Save</Button>
                        <form action={serverRemoveMembership}>
                          <input type="hidden" name="membershipId" value={membership.id} />
                          <ConfirmDeleteButton
                            title="Remove membership?"
                            message={`This removes ${user.email} from ${membership.collection.name}.`}
                            confirmLabel="Remove"
                            className="px-3 py-1.5 text-xs"
                          >
                            Remove
                          </ConfirmDeleteButton>
                        </form>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-stone-600">No collection memberships yet.</p>
                )}

                <div className="mt-3 border-t border-stone-200 pt-3">
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold">Add {user.email} to another collection</h4>
                    <p className="text-xs text-stone-600">This only creates a new membership. Use the rows above to change existing memberships.</p>
                  </div>
                  {availableCollections.length > 0 ? (
                    <form action={serverAddUserMembership} className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto] md:items-end">
                      <input type="hidden" name="userId" value={user.id} />
                      <Select label="Collection" name="collectionId">
                        {availableCollections.map((collection) => (
                          <option key={collection.id} value={collection.id}>
                            {collection.name} ({collection.status.toLowerCase()})
                          </option>
                        ))}
                      </Select>
                      <Select label="Role" name="role" defaultValue="VIEWER">
                        {collectionRoleOptions.map((role) => <option key={role}>{role}</option>)}
                      </Select>
                      <Select label="Status" name="status" defaultValue="ACTIVE">
                        {membershipStatusOptions.map((status) => <option key={status}>{status}</option>)}
                      </Select>
                      <Button className="px-3 py-1.5 text-xs">Add membership</Button>
                    </form>
                  ) : (
                    <p className="text-sm text-stone-600">This user already has a membership record for every collection.</p>
                  )}
                </div>
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
          )
        })}
      </div>
    </div>
  )
}
