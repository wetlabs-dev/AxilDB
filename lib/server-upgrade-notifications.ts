import type { DomainEvent, PrismaClient } from '@prisma/client'
import { callDeploymentAgent, deploymentAgentConfigured } from './deployment-agent-transport'
import { emitDomainEvent, eventEngineEnabled } from './events/emit'
import { appUrl, sendEmail } from './email'
import { renderBrandedEmail } from './email-templates'
import { isInQuietHours, sendPushToSubscription, webPushEnabled, type PushPreferenceKey } from './push'

export type UpgradeOutcome = { id: number; job_id: string; outcome: 'COMPLETED' | 'FAILED'; finished: string; revision: string; stage: string }
export const upgradePreferenceKeys = ['serverUpgradeCompletedEmailEnabled', 'serverUpgradeCompletedPushEnabled', 'serverUpgradeFailedEmailEnabled', 'serverUpgradeFailedPushEnabled'] as const
export function upgradePreference(outcome: string, channel: string) {
  return `serverUpgrade${outcome === 'COMPLETED' ? 'Completed' : 'Failed'}${channel === 'EMAIL' ? 'Email' : 'Push'}Enabled` as typeof upgradePreferenceKeys[number]
}
export function upgradeMessage(outcome: UpgradeOutcome) {
  const success = outcome.outcome === 'COMPLETED'
  const finished = new Date(outcome.finished).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  const stage = ['PREFLIGHT', 'BACKUP', 'FETCHING', 'PREPARING', 'BUILDING', 'MIGRATING', 'DEPLOYING', 'VERIFYING'].includes(outcome.stage) ? outcome.stage.toLowerCase() : 'deployment'
  return {
    title: success ? 'AxilDB upgrade completed' : 'AxilDB upgrade failed',
    // Never send raw command output or agent errors through an external provider.
    body: success ? `Revision ${outcome.revision.slice(0, 7)} passed health verification at ${finished}.` : `Revision ${outcome.revision.slice(0, 7)} failed during ${stage} at ${finished}. Open deployment details for recovery.`,
    url: `/server/application-updates?jobId=${outcome.job_id}`,
  }
}
export function validUpgradeOutcome(value: UpgradeOutcome) {
  return Number.isSafeInteger(value.id) && value.id > 0 && /^[a-f0-9]{32}$/.test(value.job_id) && /^[a-f0-9]{40}$/.test(value.revision) && ['COMPLETED', 'FAILED'].includes(value.outcome) && Number.isFinite(Date.parse(value.finished))
}

/** Agent acknowledgements follow the PostgreSQL commit. Replays use the same unique event keys. */
export async function ingestUpgradeOutcomes(prisma: PrismaClient, outcomes: UpgradeOutcome[]) {
  if (!eventEngineEnabled()) return []
  const acknowledged: number[] = []
  for (const outcome of outcomes) {
    if (!validUpgradeOutcome(outcome)) throw new Error('Invalid deployment notification envelope.')
    await prisma.$transaction(async tx => {
      // Serialize replay/fanout so preference changes cannot add recipients to an already ingested outcome.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`upgrade:${outcome.job_id}:${outcome.outcome}`}, 0))`
      const key = `upgrade:${outcome.job_id}:${outcome.outcome}`
      if (await tx.domainEvent.findUnique({ where: { idempotencyKey: key } })) return
      const type = outcome.outcome === 'COMPLETED' ? 'server.upgrade_completed' : 'server.upgrade_failed'
      const admins = await tx.user.findMany({ where: { role: 'SERVER_ADMIN', emailVerifiedAt: { not: null } }, include: { emailPreference: true } })
      for (const user of admins) for (const channel of ['EMAIL', 'PUSH']) {
        if (!user.emailPreference?.[upgradePreference(outcome.outcome, channel)]) continue
        await emitDomainEvent(tx, { eventType: type, aggregateId: outcome.job_id, source: 'SYSTEM', visibility: 'INTERNAL', occurredAt: new Date(outcome.finished), idempotencyKey: `${key}:${channel}:${user.id}`, payload: { subjectId: outcome.job_id, outcome, recipientId: user.id, channel } })
      }
      // Durable ingestion receipt, separate from per-recipient delivery state.
      await emitDomainEvent(tx, { eventType: type, aggregateId: outcome.job_id, source: 'SYSTEM', visibility: 'INTERNAL', occurredAt: new Date(outcome.finished), idempotencyKey: key, payload: { subjectId: outcome.job_id, outcome, channel: 'RECEIPT' } })
    })
    acknowledged.push(outcome.id)
  }
  return acknowledged
}

export async function syncUpgradeNotifications(prisma: PrismaClient) {
  if (!deploymentAgentConfigured()) return
  const { notifications } = await callDeploymentAgent<{ notifications: UpgradeOutcome[] }>('NOTIFICATIONS', 'notification-worker')
  const acknowledge = await ingestUpgradeOutcomes(prisma, notifications)
  if (acknowledge.length) await callDeploymentAgent('NOTIFICATIONS', 'notification-worker', { acknowledge })
}

export async function deliverUpgradeNotification(prisma: PrismaClient, event: DomainEvent, providers: { email?: typeof sendEmail; push?: typeof sendPushToSubscription } = {}) {
  const payload = event.payloadJson as unknown as { outcome: UpgradeOutcome; recipientId?: string; channel: string }
  if (payload.channel === 'RECEIPT') return
  if (!validUpgradeOutcome(payload.outcome) || !payload.recipientId || !['EMAIL', 'PUSH'].includes(payload.channel)) throw new Error('Invalid upgrade delivery event.')
  const user = await prisma.user.findUnique({ where: { id: payload.recipientId }, include: { emailPreference: true, pushSubscriptions: { where: { enabled: true, revokedAt: null } } } })
  const preferenceKey = upgradePreference(payload.outcome.outcome, payload.channel)
  if (!user || user.role !== 'SERVER_ADMIN' || !user.emailVerifiedAt || !user.emailPreference?.[preferenceKey]) return
  if (isInQuietHours(user.emailPreference)) throw new Error('Upgrade alert deferred until quiet hours end.')
  const message = upgradeMessage(payload.outcome)
  if (payload.channel === 'EMAIL') {
    const template = renderBrandedEmail({ title: message.title, preview: message.body, body: [message.body, `Finished: ${new Date(payload.outcome.finished).toISOString()}`], actionLabel: 'View deployment', actionUrl: appUrl(message.url) })
    await (providers.email || sendEmail)({ to: user.email, subject: message.title, text: template.text, html: template.html })
  } else {
    if (!webPushEnabled() || !process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return
    // Persist individual device receipts: retries do not resend to devices that already succeeded.
    const delivered = new Set((event.metadataJson as { deliveredSubscriptionIds?: string[] } | null)?.deliveredSubscriptionIds || [])
    let failed = false
    for (const subscription of user.pushSubscriptions) {
      if (delivered.has(subscription.id)) continue
      const result = await (providers.push || sendPushToSubscription)(subscription, { ...message, tag: `upgrade-${payload.outcome.job_id}-${payload.outcome.outcome}`, preferenceKey: preferenceKey as PushPreferenceKey }, prisma)
      if (result.sent) {
        delivered.add(subscription.id)
        await prisma.domainEvent.update({ where: { id: event.id }, data: { metadataJson: { deliveredSubscriptionIds: [...delivered] } } })
      } else if (!result.skipped) failed = true
    }
    if (failed) throw new Error('Upgrade push delivery failed; pending devices will be retried.')
  }
}
