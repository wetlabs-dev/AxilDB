import { addCollectionMember, approveMembership, inviteCollectionMember, rejectMembership, removeMembership, updateMembershipRole } from '@/app/collection-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Button, Card, Field, Select } from '@/components/ui'
import { requireCollectionManager } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

export default async function CollectionMembersPage() {
  const { collection } = await requireCollectionManager()
  const members = await prisma.collectionMembership.findMany({
    where: { collectionId: collection.id },
    include: { user: { select: { email: true, role: true, emailVerifiedAt: true } } },
    orderBy: [{ status: 'asc' }, { role: 'asc' }, { createdAt: 'asc' }],
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Collection Members</h2>
        <p className="mt-1 text-sm text-stone-600">Approve requests and manage roles for {collection.name}.</p>
      </div>
      <Card>
        <h3 className="font-serif text-xl font-semibold">Add existing user</h3>
        <p className="mt-1 text-sm text-stone-600">Managers can add existing AxilDB accounts directly to this collection.</p>
        <form action={addCollectionMember} className="mt-4 grid gap-3 md:grid-cols-[minmax(16rem,1fr)_12rem_auto] md:items-end">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Field label="User email" name="email" type="email" required />
          <Select label="Collection role" name="role" defaultValue="VIEWER">
            <option value="VIEWER">Viewer</option>
            <option value="LOGGER">Logger</option>
            <option value="GARDENER">Gardener</option>
            <option value="MANAGER">Manager</option>
          </Select>
          <Button>Add member</Button>
        </form>
      </Card>
      <Card>
        <h3 className="font-serif text-xl font-semibold">Invite by email</h3>
        <p className="mt-1 text-sm text-stone-600">If the person does not have an account yet, AxilDB will send a single-use invitation link.</p>
        <form action={inviteCollectionMember} className="mt-4 grid gap-3 md:grid-cols-[minmax(16rem,1fr)_12rem_auto] md:items-end">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Field label="Email" name="email" type="email" required />
          <Select label="Collection role" name="role" defaultValue="VIEWER">
            <option value="VIEWER">Viewer</option>
            <option value="LOGGER">Logger</option>
            <option value="GARDENER">Gardener</option>
            <option value="MANAGER">Manager</option>
          </Select>
          <Button>Send invite</Button>
        </form>
      </Card>
      <div className="grid gap-3">
        {members.map((member) => (
          <Card key={member.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold">{member.user.email}</p>
                <p className="text-sm text-stone-600">
                  {member.status.toLowerCase()} · collection {member.role.toLowerCase()} · site {member.user.role.toLowerCase()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {member.status === 'PENDING' && (
                  <>
                    <form action={approveMembership}>
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="membershipId" value={member.id} />
                      <Button className="px-3 py-1.5">Approve</Button>
                    </form>
                    <form action={rejectMembership}>
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="membershipId" value={member.id} />
                      <Button className="bg-[#9a3f35] px-3 py-1.5 hover:bg-[#7d3028]">Reject</Button>
                    </form>
                  </>
                )}
                {member.status === 'ACTIVE' && (
                  <form action={updateMembershipRole} className="flex gap-2">
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="membershipId" value={member.id} />
                    <select name="role" defaultValue={member.role} className="rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-1 text-sm">
                      <option value="VIEWER">Viewer</option>
                      <option value="LOGGER">Logger</option>
                      <option value="GARDENER">Gardener</option>
                      <option value="MANAGER">Manager</option>
                    </select>
                    <Button className="px-3 py-1.5">Save role</Button>
                  </form>
                )}
                <form action={removeMembership}>
                  <input type="hidden" name="collectionSlug" value={collection.slug} />
                  <input type="hidden" name="membershipId" value={member.id} />
                  <ConfirmDeleteButton title="Remove member?" message={`Remove ${member.user.email} from this collection?`} confirmLabel="Remove member">
                    Remove
                  </ConfirmDeleteButton>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
