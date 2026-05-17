import { approveMembership, rejectMembership, removeMembership, updateMembershipRole } from '@/app/collection-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Button, Card } from '@/components/ui'
import { requireCollectionOwner } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

export default async function CollectionMembersPage() {
  const { collection } = await requireCollectionOwner()
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
                      <option value="ADMIN">Admin</option>
                      <option value="OWNER">Owner</option>
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
