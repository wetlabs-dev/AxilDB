'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { randomBytes, createHash } from 'crypto'
import { audit, requireServerAdmin, requireUser } from '@/lib/auth'
import { collectionPath, requireCollectionManager } from '@/lib/collections'
import { sendEmail, appUrl } from '@/lib/email'
import { renderBrandedEmail } from '@/lib/email-templates'
import { prisma } from '@/lib/prisma'
import { collectionRoles, normalizeCollectionRole } from '@/lib/roles'
import { getOrCreateTodaysCollectionBriefing } from '@/lib/briefing'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const validRoles = new Set<string>(collectionRoles)

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base: string) {
  let slug = slugify(base) || `collection-${Date.now()}`
  let suffix = 2
  while (await prisma.collection.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${slugify(base)}-${suffix}`
    suffix += 1
  }
  return slug
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function roleFromForm(fd: FormData) {
  const role = normalizeCollectionRole(val(fd, 'role'))
  if (!role || !validRoles.has(role)) throw new Error('Invalid role.')
  return role
}

async function assertHasOtherManager(collectionId: string, userId: string) {
  const managerCount = await prisma.collectionMembership.count({
    where: { collectionId, status: 'ACTIVE', role: 'MANAGER', NOT: { userId } },
  })
  if (managerCount === 0) throw new Error('A collection must keep at least one manager.')
}

export async function createCollection(fd: FormData) {
  const user = await requireServerAdmin()

  const name = val(fd, 'name')
  if (!name) throw new Error('Collection name is required.')
  const slug = await uniqueSlug(val(fd, 'slug') || name)

  const collection = await prisma.collection.create({
    data: {
      name,
      slug,
      visibility: val(fd, 'visibility') === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
      status: 'ACTIVE',
      description: val(fd, 'description'),
      memberships: { create: { userId: user.id, role: 'MANAGER', status: 'ACTIVE' } },
    },
  })

  await audit(user, 'CREATE', 'COLLECTION', collection.id, `Created collection ${collection.name}`, collection, collection.id)
  redirect(collectionPath(collection.slug))
}

export async function saveCollectionSettings(fd: FormData) {
  const slug = val(fd, 'collectionSlug')
  const { user, collection } = await requireCollectionManager(slug)
  const requestedSlug = slugify(val(fd, 'slug') || collection.slug)
  const duplicate = await prisma.collection.findFirst({
    where: { slug: requestedSlug, NOT: { id: collection.id } },
    select: { id: true },
  })
  if (duplicate) throw new Error('That collection slug is already in use.')

  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: {
      name: val(fd, 'name') || collection.name,
      slug: requestedSlug,
      visibility: val(fd, 'visibility') === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
      description: val(fd, 'description'),
      aiBriefingEnabled: collection.aiFeaturesEnabled && val(fd, 'aiBriefingEnabled') === 'on',
    },
  })
  await audit(user, 'UPDATE', 'COLLECTION', collection.id, `Updated collection ${updated.name}`, updated, collection.id)
  revalidatePath('/collections')
  revalidatePath(collectionPath(collection.slug))
  revalidatePath(collectionPath(collection.slug, '/collection-settings'))
  revalidatePath(collectionPath(updated.slug))
  revalidatePath(collectionPath(updated.slug, '/collection-settings'))
  return { collection, updated }
}

export async function regenerateCollectionBriefing(fd: FormData) {
  const user = await requireServerAdmin()
  const slug = val(fd, 'collectionSlug')
  const collection = await prisma.collection.findUniqueOrThrow({ where: { slug } })
  if (!collection.aiFeaturesEnabled || !collection.aiBriefingEnabled) {
    throw new Error('Collection briefings are not enabled for this collection.')
  }
  const briefing = await getOrCreateTodaysCollectionBriefing(prisma, {
    collectionId: collection.id,
    collectionSlug: collection.slug,
    userId: user.id,
    force: true,
  })
  await audit(user, 'GENERATE', 'COLLECTION_BRIEFING', briefing.id, `Regenerated collection briefing for ${collection.name}`, {
    status: briefing.status,
    localDate: briefing.localDate,
    model: briefing.model,
  }, collection.id)
  revalidatePath(collectionPath(collection.slug))
  redirect(collectionPath(collection.slug))
}

export async function updateCollection(fd: FormData) {
  const { updated } = await saveCollectionSettings(fd)
  redirect(collectionPath(updated.slug, '/collection-settings'))
}

export async function requestMembership(fd: FormData) {
  const user = await requireUser()
  const slug = val(fd, 'collectionSlug')
  const collection = await prisma.collection.findUniqueOrThrow({ where: { slug } })
  await prisma.collectionMembership.upsert({
    where: { collectionId_userId: { collectionId: collection.id, userId: user.id } },
    update: { status: 'PENDING' },
    create: { collectionId: collection.id, userId: user.id, role: 'VIEWER', status: 'PENDING' },
  })
  await audit(user, 'REQUEST', 'COLLECTION_MEMBERSHIP', collection.id, `Requested membership in ${collection.name}`, undefined, collection.id)
  redirect('/collections')
}

export async function requestCollection(fd: FormData) {
  const user = await requireUser()
  const name = val(fd, 'name')
  if (!name) throw new Error('Collection name is required.')
  const requestedSlug = slugify(val(fd, 'slug') || name)
  if (!requestedSlug) throw new Error('Collection slug is required.')

  const activeCollection = await prisma.collection.findUnique({ where: { slug: requestedSlug }, select: { id: true } })
  if (activeCollection) throw new Error('A collection already uses that slug.')

  const existingPending = await prisma.collectionRequest.findFirst({
    where: { requestedById: user.id, status: 'PENDING', requestedSlug },
    select: { id: true },
  })
  if (existingPending) redirect('/collections?collectionRequest=already-pending')

  const request = await prisma.collectionRequest.create({
    data: {
      requestedById: user.id,
      requestedName: name,
      requestedSlug,
      visibility: val(fd, 'visibility') === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
      description: val(fd, 'description'),
      rationale: val(fd, 'rationale'),
    },
  })

  await audit(user, 'REQUEST', 'COLLECTION_REQUEST', request.id, `Requested collection ${name}`, request)

  const admins = await prisma.user.findMany({ where: { role: 'SERVER_ADMIN' }, select: { id: true, email: true } })
  const serverUrl = appUrl('/server')
  const template = renderBrandedEmail({
    title: 'New AxilDB collection request',
    preview: `${user.email} requested a new collection.`,
    body: [
      `${user.email} requested a new collection named ${name}.`,
      `Requested slug: ${requestedSlug}`,
      `Visibility: ${request.visibility.toLowerCase()}`,
      request.rationale ? `Reason: ${request.rationale}` : 'No reason was provided.',
    ],
    actionLabel: 'Review request',
    actionUrl: serverUrl,
  })

  await Promise.all(
    admins.map(async (admin) => {
      try {
        await sendEmail({ to: admin.email, subject: `AxilDB collection request: ${name}`, ...template })
      } catch (error) {
        await audit(user, 'ERROR', 'EMAIL', request.id, `Failed to notify ${admin.email} about collection request`, { error: String(error), admin: admin.email })
      }
    }),
  )

  redirect('/collections?collectionRequest=requested')
}

export async function approveCollectionRequest(fd: FormData) {
  const user = await requireServerAdmin()
  const requestId = val(fd, 'requestId')
  const request = await prisma.collectionRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { requestedBy: { select: { id: true, email: true } } },
  })
  if (request.status !== 'PENDING') throw new Error('This request has already been reviewed.')

  const slug = await uniqueSlug(request.requestedSlug || request.requestedName)
  const collection = await prisma.$transaction(async (tx) => {
    const created = await tx.collection.create({
      data: {
        name: request.requestedName,
        slug,
        visibility: request.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
        status: 'ACTIVE',
        description: request.description,
        memberships: { create: { userId: request.requestedById, role: 'MANAGER', status: 'ACTIVE' } },
      },
    })
    await tx.collectionRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        reviewedById: user.id,
        reviewedAt: new Date(),
        collectionId: created.id,
        reviewNote: val(fd, 'reviewNote'),
      },
    })
    return created
  })

  await audit(user, 'APPROVE', 'COLLECTION_REQUEST', request.id, `Approved collection request ${request.requestedName}`, { requestId: request.id, collectionId: collection.id }, collection.id)
  await audit(user, 'CREATE', 'COLLECTION', collection.id, `Created collection ${collection.name} from request`, collection, collection.id)

  if (request.requestedBy.email) {
    const template = renderBrandedEmail({
      title: 'Your AxilDB collection is ready',
      preview: `${collection.name} has been created.`,
      body: [
        `Good news: ${collection.name} has been approved and created.`,
        'You have been added as the collection manager, so you can manage settings and invite members.',
      ],
      actionLabel: 'Open collection',
      actionUrl: appUrl(collectionPath(collection.slug)),
    })
    try {
      await sendEmail({ to: request.requestedBy.email, subject: `Your AxilDB collection is ready: ${collection.name}`, ...template })
    } catch (error) {
      await audit(user, 'ERROR', 'EMAIL', request.id, `Failed to email collection request approval`, { error: String(error), email: request.requestedBy.email }, collection.id)
    }
  }

  redirect('/server?collectionRequest=approved')
}

export async function rejectCollectionRequest(fd: FormData) {
  const user = await requireServerAdmin()
  const requestId = val(fd, 'requestId')
  const request = await prisma.collectionRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { requestedBy: { select: { email: true } } },
  })
  if (request.status !== 'PENDING') throw new Error('This request has already been reviewed.')

  const reviewNote = val(fd, 'reviewNote')
  await prisma.collectionRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED', reviewedById: user.id, reviewedAt: new Date(), reviewNote },
  })
  await audit(user, 'REJECT', 'COLLECTION_REQUEST', request.id, `Rejected collection request ${request.requestedName}`, { reviewNote })

  if (request.requestedBy.email) {
    const template = renderBrandedEmail({
      title: 'AxilDB collection request update',
      preview: `${request.requestedName} was not approved right now.`,
      body: [
        `Your request for ${request.requestedName} was not approved right now.`,
        reviewNote ? `Note from the server admin: ${reviewNote}` : 'No review note was provided.',
      ],
      actionLabel: 'Open AxilDB',
      actionUrl: appUrl('/collections'),
    })
    try {
      await sendEmail({ to: request.requestedBy.email, subject: `AxilDB collection request update: ${request.requestedName}`, ...template })
    } catch (error) {
      await audit(user, 'ERROR', 'EMAIL', request.id, `Failed to email collection request rejection`, { error: String(error), email: request.requestedBy.email })
    }
  }

  redirect('/server?collectionRequest=rejected')
}

export async function requestAiAccess(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  if (collection.aiFeaturesEnabled) redirect(collectionPath(collection.slug, '/collection-settings?aiAccess=already-enabled'))

  const existingPending = await prisma.aiAccessRequest.findFirst({
    where: { collectionId: collection.id, status: 'PENDING' },
    select: { id: true },
  })
  if (existingPending) redirect(collectionPath(collection.slug, '/collection-settings?aiAccess=already-pending'))

  const request = await prisma.aiAccessRequest.create({
    data: {
      collectionId: collection.id,
      requestedById: user.id,
      rationale: val(fd, 'rationale'),
    },
  })

  await audit(user, 'REQUEST', 'AI_ACCESS_REQUEST', request.id, `Requested AI access for ${collection.name}`, request, collection.id)

  const admins = await prisma.user.findMany({ where: { role: 'SERVER_ADMIN' }, select: { email: true } })
  const template = renderBrandedEmail({
    title: 'New AxilDB AI access request',
    preview: `${user.email} requested AI features for ${collection.name}.`,
    body: [
      `${user.email} requested AI features for ${collection.name}.`,
      val(fd, 'rationale') ? `Reason: ${val(fd, 'rationale')}` : 'No reason was provided.',
      'Approve this only for collections where API usage is expected and acceptable.',
    ],
    actionLabel: 'Review request',
    actionUrl: appUrl('/server'),
  })

  await Promise.all(
    admins.map(async (admin) => {
      try {
        await sendEmail({ to: admin.email, subject: `AxilDB AI access request: ${collection.name}`, ...template })
      } catch (error) {
        await audit(user, 'ERROR', 'EMAIL', request.id, `Failed to notify ${admin.email} about AI access request`, { error: String(error), admin: admin.email }, collection.id)
      }
    }),
  )

  redirect(collectionPath(collection.slug, '/collection-settings?aiAccess=requested'))
}

export async function approveAiAccessRequest(fd: FormData) {
  const user = await requireServerAdmin()
  const requestId = val(fd, 'requestId')
  const request = await prisma.aiAccessRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      collection: { select: { id: true, name: true, slug: true } },
      requestedBy: { select: { email: true } },
    },
  })
  if (request.status !== 'PENDING') throw new Error('This request has already been reviewed.')

  await prisma.$transaction([
    prisma.collection.update({ where: { id: request.collectionId }, data: { aiFeaturesEnabled: true } }),
    prisma.aiAccessRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', reviewedById: user.id, reviewedAt: new Date(), reviewNote: val(fd, 'reviewNote') },
    }),
  ])
  await audit(user, 'APPROVE', 'AI_ACCESS_REQUEST', request.id, `Approved AI access for ${request.collection.name}`, { requestId: request.id }, request.collectionId)

  if (request.requestedBy.email) {
    const template = renderBrandedEmail({
      title: 'AI features are enabled',
      preview: `AI features are now enabled for ${request.collection.name}.`,
      body: [
        `AI features are now enabled for ${request.collection.name}.`,
        'Collection members with record-creation permissions can use AI draft and Magic Fill tools where available.',
      ],
      actionLabel: 'Open collection settings',
      actionUrl: appUrl(collectionPath(request.collection.slug, '/collection-settings')),
    })
    try {
      await sendEmail({ to: request.requestedBy.email, subject: `AI enabled for ${request.collection.name}`, ...template })
    } catch (error) {
      await audit(user, 'ERROR', 'EMAIL', request.id, 'Failed to email AI access approval', { error: String(error), email: request.requestedBy.email }, request.collectionId)
    }
  }

  redirect('/server?aiAccess=approved')
}

export async function rejectAiAccessRequest(fd: FormData) {
  const user = await requireServerAdmin()
  const requestId = val(fd, 'requestId')
  const request = await prisma.aiAccessRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      collection: { select: { id: true, name: true, slug: true } },
      requestedBy: { select: { email: true } },
    },
  })
  if (request.status !== 'PENDING') throw new Error('This request has already been reviewed.')

  const reviewNote = val(fd, 'reviewNote')
  await prisma.aiAccessRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED', reviewedById: user.id, reviewedAt: new Date(), reviewNote },
  })
  await audit(user, 'REJECT', 'AI_ACCESS_REQUEST', request.id, `Rejected AI access for ${request.collection.name}`, { reviewNote }, request.collectionId)

  if (request.requestedBy.email) {
    const template = renderBrandedEmail({
      title: 'AxilDB AI access request update',
      preview: `AI features were not enabled for ${request.collection.name} right now.`,
      body: [
        `AI features were not enabled for ${request.collection.name} right now.`,
        reviewNote ? `Note from the server admin: ${reviewNote}` : 'No review note was provided.',
      ],
      actionLabel: 'Open collection settings',
      actionUrl: appUrl(collectionPath(request.collection.slug, '/collection-settings')),
    })
    try {
      await sendEmail({ to: request.requestedBy.email, subject: `AI access request update: ${request.collection.name}`, ...template })
    } catch (error) {
      await audit(user, 'ERROR', 'EMAIL', request.id, 'Failed to email AI access rejection', { error: String(error), email: request.requestedBy.email }, request.collectionId)
    }
  }

  redirect('/server?aiAccess=rejected')
}

export async function setCollectionAiFeatures(fd: FormData) {
  const user = await requireServerAdmin()
  const collectionId = val(fd, 'collectionId')
  const enabled = val(fd, 'enabled') === 'true'
  const collection = await prisma.collection.update({
    where: { id: collectionId },
    data: { aiFeaturesEnabled: enabled },
  })
  await audit(user, 'UPDATE', 'COLLECTION_AI_FEATURES', collection.id, `${enabled ? 'Enabled' : 'Disabled'} AI features for ${collection.name}`, { enabled }, collection.id)
  redirect('/server/collections')
}

export async function approveMembership(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const membershipId = val(fd, 'membershipId')
  const membership = await prisma.collectionMembership.findFirstOrThrow({ where: { id: membershipId, collectionId: collection.id } })
  await prisma.collectionMembership.update({ where: { id: membership.id }, data: { status: 'ACTIVE' } })
  await audit(user, 'APPROVE', 'COLLECTION_MEMBERSHIP', membership.id, `Approved collection membership`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function rejectMembership(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const membershipId = val(fd, 'membershipId')
  const membership = await prisma.collectionMembership.findFirstOrThrow({ where: { id: membershipId, collectionId: collection.id } })
  await prisma.collectionMembership.update({ where: { id: membership.id }, data: { status: 'REJECTED' } })
  await audit(user, 'REJECT', 'COLLECTION_MEMBERSHIP', membership.id, `Rejected collection membership`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function addCollectionMember(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const email = val(fd, 'email').toLowerCase()
  const role = roleFromForm(fd)
  if (!email) throw new Error('Email is required.')

  const memberUser = await prisma.user.findUnique({ where: { email } })
  if (!memberUser) throw new Error('No user exists with that email address.')

  const membership = await prisma.collectionMembership.upsert({
    where: { collectionId_userId: { collectionId: collection.id, userId: memberUser.id } },
    update: { role, status: 'ACTIVE' },
    create: { collectionId: collection.id, userId: memberUser.id, role, status: 'ACTIVE' },
  })

  await audit(user, 'CREATE', 'COLLECTION_MEMBERSHIP', membership.id, `Added ${email} to ${collection.name} as ${role}`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function updateMembershipRole(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const membershipId = val(fd, 'membershipId')
  const role = roleFromForm(fd)
  const membership = await prisma.collectionMembership.findFirstOrThrow({ where: { id: membershipId, collectionId: collection.id } })
  if (normalizeCollectionRole(membership.role) === 'MANAGER' && role !== 'MANAGER') await assertHasOtherManager(collection.id, membership.userId)
  await prisma.collectionMembership.update({ where: { id: membership.id }, data: { role } })
  await audit(user, 'UPDATE', 'COLLECTION_MEMBERSHIP', membership.id, `Changed collection role to ${role}`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function removeMembership(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const membershipId = val(fd, 'membershipId')
  const membership = await prisma.collectionMembership.findFirstOrThrow({ where: { id: membershipId, collectionId: collection.id } })
  if (normalizeCollectionRole(membership.role) === 'MANAGER') await assertHasOtherManager(collection.id, membership.userId)
  await prisma.collectionMembership.delete({ where: { id: membership.id } })
  await audit(user, 'DELETE', 'COLLECTION_MEMBERSHIP', membership.id, `Removed collection member`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function inviteCollectionMember(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const email = val(fd, 'email').toLowerCase()
  const role = roleFromForm(fd)
  if (!email) throw new Error('Email is required.')

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    const membership = await prisma.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId: collection.id, userId: existingUser.id } },
      update: { role, status: 'ACTIVE' },
      create: { collectionId: collection.id, userId: existingUser.id, role, status: 'ACTIVE' },
    })
    await audit(user, 'CREATE', 'COLLECTION_MEMBERSHIP', membership.id, `Added ${email} to ${collection.name} as ${role}`, membership, collection.id)
    redirect(collectionPath(collection.slug, '/members'))
  }

  const token = randomBytes(32).toString('base64url')
  const invitation = await prisma.collectionInvitation.create({
    data: {
      collectionId: collection.id,
      email,
      role,
      tokenHash: tokenHash(token),
      inviterId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
  const inviteUrl = appUrl(`/register?invite=${encodeURIComponent(token)}`)
  const template = renderBrandedEmail({
    title: `Join ${collection.name} on AxilDB`,
    preview: `${user.email} invited you to an AxilDB collection.`,
    body: [
      `${user.email} invited you to join ${collection.name} as ${role.toLowerCase()}.`,
      'Create your account with this single-use link and AxilDB will add you to the collection.',
    ],
    actionLabel: 'Accept invitation',
    actionUrl: inviteUrl,
  })
  await sendEmail({ to: email, subject: `Join ${collection.name} on AxilDB`, ...template })
  await audit(user, 'INVITE', 'COLLECTION_INVITATION', invitation.id, `Invited ${email} to ${collection.name} as ${role}`, { email, role }, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function archiveCollection(fd: FormData) {
  const user = await requireServerAdmin()
  const collectionId = val(fd, 'collectionId')
  const collection = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })
  if (collection.isDefault) throw new Error('The default collection cannot be archived.')
  await prisma.collection.update({
    where: { id: collection.id },
    data: { status: 'ARCHIVED', archivedAt: new Date(), archivedById: user.id },
  })
  await audit(user, 'ARCHIVE', 'COLLECTION', collection.id, `Archived collection ${collection.name}`, collection, collection.id)
  redirect('/server/collections')
}

export async function setDefaultCollection(fd: FormData) {
  const user = await requireServerAdmin()
  const collectionId = val(fd, 'collectionId')
  const collection = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })
  if (collection.status === 'ARCHIVED') throw new Error('Archived collections cannot be the default collection.')

  await prisma.$transaction([
    prisma.collection.updateMany({ where: { isDefault: true, NOT: { id: collection.id } }, data: { isDefault: false } }),
    prisma.collection.update({ where: { id: collection.id }, data: { isDefault: true } }),
  ])
  await audit(user, 'UPDATE', 'COLLECTION', collection.id, `Set ${collection.name} as the default collection`, collection, collection.id)
  redirect('/server/collections')
}

export async function restoreCollection(fd: FormData) {
  const user = await requireServerAdmin()
  const collectionId = val(fd, 'collectionId')
  const collection = await prisma.collection.update({
    where: { id: collectionId },
    data: { status: 'ACTIVE', archivedAt: null, archivedById: null },
  })
  await audit(user, 'RESTORE', 'COLLECTION', collection.id, `Restored collection ${collection.name}`, collection, collection.id)
  redirect('/server/collections')
}

export async function permanentlyDeleteCollection(fd: FormData) {
  const user = await requireServerAdmin()
  const collectionId = val(fd, 'collectionId')
  const confirmSlug = val(fd, 'confirmSlug')
  const collection = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })
  if (collection.isDefault) throw new Error('The default collection cannot be deleted.')
  if (collection.status !== 'ARCHIVED') throw new Error('Archive the collection before deleting it permanently.')
  if (confirmSlug !== collection.slug) throw new Error('Type the collection slug to confirm deletion.')
  await audit(user, 'DELETE', 'COLLECTION', collection.id, `Permanently deleted collection ${collection.name}`, collection, null)
  await prisma.collection.delete({ where: { id: collection.id } })
  redirect('/server/collections')
}
