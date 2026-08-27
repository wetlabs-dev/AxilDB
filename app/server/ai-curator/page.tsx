import { updateAiCuratorSettings, reviewAiCuratorSuggestion, resolveAiCuratorJob } from '@/app/ai-curator-actions'
import { Button, Card, Field, LinkButton, Select, TextArea } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { aiCuratorDashboard, aiCuratorReviewQueue, canApplyCuratorSuggestion } from '@/lib/ai-curator'
import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/time'
import { plantName } from '@/lib/utils'

function money(value: unknown) {
  return `$${(Number(value) || 0).toFixed(2)}`
}

function pct(value: number) {
  return `${Math.round(value)}%`
}

function statusClass(status: string) {
  if (status === 'Running') return 'border-green-200 bg-green-50 text-green-900'
  if (status === 'Waiting') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (status === 'Paused') return 'border-blue-200 bg-blue-50 text-blue-900'
  return 'border-stone-200 bg-stone-50 text-stone-700'
}

function queueCount(stats: Record<string, number>, key: string) {
  return stats[key] || 0
}

function jsonDisplay(value: unknown) {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2) || ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function fieldLabel(value?: string | null) {
  if (!value) return 'Suggestion'
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function fieldWeight(field: string) {
  const order = [
    'genus',
    'species',
    'hybridNotation',
    'cultivarName',
    'authority',
    'confidence',
    'provisionalTaxon',
    'identificationStatus',
    'description',
    'notes',
    'wikipediaUrl',
    'inaturalistUrl',
    'powoUrl',
    'gbifUrl',
  ]
  const index = order.indexOf(field)
  return index === -1 ? order.length : index
}

function orderedEntries(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => fieldWeight(a) - fieldWeight(b) || a.localeCompare(b))
}

function compactValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'No value recorded'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : 'No items'
  if (isRecord(value)) {
    if (typeof value.label === 'string') return value.label
    if (typeof value.name === 'string' && typeof value.category === 'string') return `${value.name} (${fieldLabel(value.category)})`
    if (typeof value.name === 'string') return value.name
    if (typeof value.displayName === 'string') return value.displayName
    const parts = orderedEntries(value)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && typeof entryValue !== 'object')
      .slice(0, 3)
      .map(([key, entryValue]) => `${fieldLabel(key)}: ${compactValue(entryValue)}`)
    return parts.length ? parts.join(' · ') : `${Object.keys(value).length} fields`
  }
  return String(value)
}

function currentFocusValue(value: unknown) {
  if (isRecord(value) && isRecord(value.focus) && Object.prototype.hasOwnProperty.call(value.focus, 'currentValue')) {
    if (value.focus.targetField === 'taxonomy' && isRecord(value.taxonomy)) return value.taxonomy
    return value.focus.currentValue
  }
  if (isRecord(value) && isRecord(value.taxonomy)) return value.taxonomy
  return value
}

function contextHighlights(value: unknown) {
  if (!isRecord(value)) return []
  const highlights: string[] = []
  const plantDefinition = isRecord(value.plantDefinition) ? value.plantDefinition : null
  const collection = isRecord(value.collection) ? value.collection : null
  const taxonomy = isRecord(value.taxonomy) ? value.taxonomy : null
  const counts = isRecord(value.counts) ? value.counts : null
  const tags = Array.isArray(value.tags) ? value.tags : []
  const aliases = Array.isArray(value.aliases) ? value.aliases : []
  const references = isRecord(value.references) ? value.references : null
  if (plantDefinition?.displayName) highlights.push(`Record: ${compactValue(plantDefinition.displayName)}`)
  if (!plantDefinition?.displayName && taxonomy?.genus) highlights.push(`Record: ${compactValue(taxonomy.genus)}${taxonomy.species ? ` ${compactValue(taxonomy.species)}` : ''}`)
  if (collection?.name) highlights.push(`Collection: ${compactValue(collection.name)}`)
  if (counts?.instances) highlights.push(`${compactValue(counts.instances)} instance${Number(counts.instances) === 1 ? '' : 's'}`)
  if (aliases.length) highlights.push(`${aliases.length} alias${aliases.length === 1 ? '' : 'es'}`)
  if (tags.length) highlights.push(`Tags: ${tags.slice(0, 4).map(compactValue).join(', ')}`)
  if (references) {
    const present = Object.entries(references).filter(([, ref]) => Boolean(ref)).map(([key]) => fieldLabel(key.replace(/Url$/, '')))
    if (present.length) highlights.push(`References: ${present.join(', ')}`)
  }
  return highlights.slice(0, 6)
}

function confidenceText(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'Confidence not scored'
  return `${Math.round(number * 100)}% confidence`
}

function referenceList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((reference) => ({
      label: compactValue(reference.label || reference.url),
      url: typeof reference.url === 'string' ? reference.url : null,
    }))
    .filter((reference) => reference.label !== 'No value recorded')
}

function PrettyValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <p className="rounded-md border border-dashed border-stone-300 bg-white/45 p-3 text-sm italic text-stone-500">No value recorded.</p>
  }
  if (typeof value !== 'object') {
    return <p className="whitespace-pre-wrap rounded-md border border-stone-200 bg-white/55 p-3 text-sm text-stone-800">{compactValue(value)}</p>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="rounded-md border border-dashed border-stone-300 bg-white/45 p-3 text-sm italic text-stone-500">No items.</p>
    return (
      <div className="flex flex-wrap gap-2">
        {value.slice(0, 12).map((item, index) => (
          <span key={`${compactValue(item)}-${index}`} className="rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-sm text-stone-800">{compactValue(item)}</span>
        ))}
        {value.length > 12 && <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-sm text-stone-600">+{value.length - 12} more</span>}
      </div>
    )
  }
  return (
    <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {orderedEntries(value as Record<string, unknown>).slice(0, 18).map(([key, entryValue]) => (
        <div key={key} className="min-w-0 rounded-md border border-stone-200 bg-white/60 p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{fieldLabel(key)}</dt>
          <dd className="mt-1 min-w-0 break-words text-sm text-stone-900">{compactValue(entryValue)}</dd>
        </div>
      ))}
    </dl>
  )
}

function ReviewSuggestionCard({ suggestion }: { suggestion: any }) {
  const currentValue = currentFocusValue(suggestion.currentValue)
  const highlights = contextHighlights(suggestion.currentValue)
  const references = referenceList(suggestion.supportingReferences)
  const appliesDirectly = canApplyCuratorSuggestion(suggestion.targetField)
  return (
    <details className="rounded-lg border border-stone-200 bg-[#fffdf7] p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{suggestion.title}</p>
            <p className="mt-1 text-sm text-stone-600">{fieldLabel(suggestion.targetField)} · {confidenceText(suggestion.confidence)}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${appliesDirectly ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            {appliesDirectly ? 'Can apply' : 'Manual follow-up'}
          </span>
        </div>
      </summary>
      <div className="mt-3 grid gap-4">
        <p className="rounded-md border border-stone-200 bg-white/50 p-3 text-sm leading-6 text-stone-800">{suggestion.reasoning}</p>
        {references.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {references.map((reference, index) => reference.url ? (
              <a key={`${reference.url}-${index}`} href={reference.url} target="_blank" rel="noreferrer" className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-900 underline-offset-2 hover:underline">
                {reference.label}
              </a>
            ) : (
              <span key={`${reference.label}-${index}`} className="rounded-full border border-stone-200 bg-white/65 px-3 py-1 text-sm text-stone-700">{reference.label}</span>
            ))}
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-lg border border-stone-200 bg-white/35 p-3">
            <h5 className="font-semibold">Current focus</h5>
            <div className="mt-2">
              <PrettyValue value={currentValue} />
            </div>
            {highlights.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {highlights.map((highlight) => (
                  <span key={highlight} className="rounded-full border border-stone-200 bg-[#f5f0e2] px-3 py-1 text-xs font-medium text-stone-700">{highlight}</span>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-lg border border-green-200 bg-green-50/35 p-3">
            <h5 className="font-semibold text-green-950">Proposed change</h5>
            <div className="mt-2">
              <PrettyValue value={suggestion.suggestedValue} />
            </div>
          </section>
        </div>
        <form action={reviewAiCuratorSuggestion} className="grid gap-3 rounded-lg border border-stone-200 bg-white/45 p-3">
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <TextArea label="Review note" name="reviewNote" className="min-h-16" />
          <details className="rounded-md border border-stone-200 bg-[#fffdf7] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-stone-800">Advanced edit</summary>
            <TextArea label="Suggested value JSON" name="suggestedValueJson" defaultValue={jsonDisplay(suggestion.suggestedValue)} className="mt-2 min-h-32 font-mono text-xs" />
          </details>
          <p className="text-xs text-stone-600">
            {appliesDirectly ? 'Accept applies this field to the plant definition.' : 'Accept records curator approval for manual follow-up.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button name="action" value="ACCEPT" className="px-3 py-1.5 text-xs">Accept</Button>
            <Button name="action" value="EDIT_ACCEPT" className="bg-[#6d7f6d] px-3 py-1.5 text-xs hover:bg-[#536453]">Edit then Accept</Button>
            <Button name="action" value="REJECT" className="bg-[#9a3f35] px-3 py-1.5 text-xs hover:bg-[#7d3028]">Reject</Button>
          </div>
        </form>
      </div>
    </details>
  )
}

export default async function AiCuratorPage({
  searchParams,
}: {
  searchParams: Promise<{ settings?: string; review?: string }>
}) {
  const admin = await requireServerAdmin()
  const sp = await searchParams
  const [preferences, dashboard, reviewGroups, collections] = await Promise.all([
    prisma.emailPreference.findUnique({ where: { userId: admin.id } }),
    aiCuratorDashboard(prisma),
    aiCuratorReviewQueue(prisma),
    prisma.collection.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, aiFeaturesEnabled: true, aiCuratorEnabled: true },
    }),
  ])
  const timezone = preferences?.timezone
  const status = dashboard.currentJob ? 'Running' : !dashboard.settings.enabled ? 'Stopped' : dashboard.budget.hardStop ? 'Paused' : 'Waiting'
  const queuedJobs = queueCount(dashboard.queueStats, 'QUEUED')
  const waitingJobs = queueCount(dashboard.queueStats, 'WAITING_FOR_HUMAN')
  const currentPhase = dashboard.currentJob?.phase || (queuedJobs ? 'ENRICHMENT' : waitingJobs ? 'WAITING FOR HUMAN' : 'STEWARDSHIP')
  const activeQueueTotal = ['QUEUED', 'RUNNING', 'DEFERRED', 'WAITING_FOR_HUMAN'].reduce((total, key) => total + queueCount(dashboard.queueStats, key), 0)
  const waitingJobBadge = waitingJobs > dashboard.waitingJobs.length ? `${waitingJobs} jobs · showing ${dashboard.waitingJobs.length}` : `${waitingJobs} jobs`
  const averageConfidenceRows = await prisma.aiCuratorSuggestion.aggregate({ where: { confidence: { not: null } }, _avg: { confidence: true } })
  const latestRun = await prisma.serverWorkerRun.findFirst({ where: { workerName: 'ai-curator' }, orderBy: { startedAt: 'desc' } })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">AI Curator</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-600">
            Autonomous botanical enrichment prepares suggestions for human review. It never applies research directly.
          </p>
        </div>
        <LinkButton href="/server">Server Management</LinkButton>
      </div>

      {sp.settings === 'updated' && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">AI Curator settings updated.</p>}
      {sp.review && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Review action recorded.</p>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Current status</h3>
            <p className="mt-1 text-sm text-stone-600">Cadence: every {dashboard.settings.cadenceMinutes} minutes · concurrency {dashboard.settings.concurrency}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusClass(status)}`}>{status}</span>
            <span className="rounded-full border border-stone-200 bg-white/60 px-3 py-1 text-sm font-semibold text-stone-800">{String(currentPhase).toLowerCase()}</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Today&apos;s spend</p>
            <p className="mt-1 text-2xl font-semibold">{money(dashboard.budget.todaySpend)}</p>
            <p className="text-xs text-stone-600">{money(dashboard.budget.remainingToday)} remaining of {money(dashboard.budget.dailyBudget)}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Jobs</p>
            <p className="mt-1 text-2xl font-semibold">{dashboard.completedToday} today</p>
            <p className="text-xs text-stone-600">{dashboard.completedWeek} this week · {queuedJobs} ready</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Review</p>
            <p className="mt-1 text-2xl font-semibold">{dashboard.pendingSuggestions}</p>
            <p className="text-xs text-stone-600">{waitingJobs} waiting for human</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Collection quality</p>
            <p className="mt-1 text-2xl font-semibold">{pct(dashboard.averageCompleteness)}</p>
            <p className="text-xs text-stone-600">Average completeness · {pct((averageConfidenceRows._avg.confidence || 0) * 100)} average confidence</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <span>Active jobs: {activeQueueTotal}</span>
          <span>Estimated queue completion: {dashboard.estimatedQueueCompletion}</span>
          <span>Last wake: {latestRun ? formatDateTime(latestRun.startedAt, timezone) : 'never'}</span>
          <span>Last sleep: {latestRun?.finishedAt ? formatDateTime(latestRun.finishedAt, timezone) : 'not recorded'}</span>
          <span>Worker health: {dashboard.health.lastRunStatus.toLowerCase()}</span>
          <span>Definitions completed: {dashboard.completedDefinitions}</span>
          <span>Enabled collections: {dashboard.enabledCollections}/{dashboard.totalCollections}</span>
          <span>Monthly spend: {money(dashboard.budget.monthSpend)} of {money(dashboard.budget.monthlyBudget)}</span>
        </div>
        {dashboard.currentJob && (
          <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-950">
            Current job: {dashboard.currentJob.jobType.replaceAll('_', ' ').toLowerCase()} for {dashboard.currentJob.plantDefinition ? dashboard.currentJob.plantDefinition.genus : dashboard.currentJob.collection.name}.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Service settings</h3>
        <form action={updateAiCuratorSettings} className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white/50 p-3 text-sm font-medium lg:col-span-4">
            <input type="checkbox" name="enabled" defaultChecked={dashboard.settings.enabled} />
            Enable AI Curator service
          </label>
          <Field label="Model" name="model" defaultValue={dashboard.settings.model} />
          <Field label="Temperature" name="temperature" type="number" min="0" max="2" step="0.1" defaultValue={dashboard.settings.temperature} />
          <Select label="Reasoning" name="reasoningEffort" defaultValue={dashboard.settings.reasoningEffort}>
            {['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((effort) => <option key={effort} value={effort}>{effort}</option>)}
          </Select>
          <Field label="Max tokens" name="maxTokens" type="number" min="100" max="8000" defaultValue={dashboard.settings.maxTokens} />
          <Field label="Daily budget" name="dailyBudgetDollars" type="number" min="0" step="0.01" defaultValue={Number(dashboard.settings.dailyBudgetDollars)} />
          <Field label="Monthly budget" name="monthlyBudgetDollars" type="number" min="0" step="0.01" defaultValue={Number(dashboard.settings.monthlyBudgetDollars)} />
          <Field label="Concurrency" name="concurrency" type="number" min="1" max="16" defaultValue={dashboard.settings.concurrency} />
          <Field label="Cadence minutes" name="cadenceMinutes" type="number" min="1" max="1440" defaultValue={dashboard.settings.cadenceMinutes} />
          <Field label="Soft limit percent" name="softLimitPercent" type="number" min="1" max="100" defaultValue={dashboard.settings.softLimitPercent} />
          <Field label="Hard limit percent" name="hardLimitPercent" type="number" min="1" max="100" defaultValue={dashboard.settings.hardLimitPercent} />
          <Field label="Max attempts" name="maxAttempts" type="number" min="1" max="10" defaultValue={dashboard.settings.maxAttempts} />
          <Field label="Suggestion expiry days" name="suggestionExpiryDays" type="number" min="1" max="365" defaultValue={dashboard.settings.suggestionExpiryDays} />
          <Field label="Rejected cooldown days" name="rejectedSuggestionCooldownDays" type="number" min="1" max="365" defaultValue={dashboard.settings.rejectedSuggestionCooldownDays} />
          <Field label="Time slice seconds" name="timeSliceSeconds" type="number" min="10" max="900" defaultValue={dashboard.settings.timeSliceSeconds} />
          <div className="lg:col-span-4">
            <Button>Save Curator settings</Button>
          </div>
        </form>
      </Card>

      {dashboard.waitingJobs.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-xl font-semibold">Waiting for Human</h3>
              <p className="mt-1 text-sm text-stone-600">These jobs need a curator to clear an ambiguity, add missing evidence, or cancel the work.</p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">{waitingJobBadge}</span>
          </div>
          <div className="mt-4 grid gap-3">
            {dashboard.waitingJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-amber-200 bg-amber-50/55 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{job.plantDefinition ? plantName(job.plantDefinition) : job.collection.name}</p>
                    <p className="text-sm text-amber-950">{job.blockingReason}</p>
                    {job.humanActionRequired && <p className="mt-1 text-sm text-stone-700">Suggested action: {job.humanActionRequired}</p>}
                    {job.retryConditions && <p className="mt-1 text-xs text-stone-600">Retry when: {job.retryConditions}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {job.plantDefinitionId && (
                      <LinkButton href={`/c/${job.collection.slug}/plants/${job.plantDefinitionId}/edit`} className="px-3 py-1.5 text-xs">
                        Open definition
                      </LinkButton>
                    )}
                    <form action={resolveAiCuratorJob}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="action" value="RETRY" />
                      <Button className="px-3 py-1.5 text-xs">Retry</Button>
                    </form>
                    <form action={resolveAiCuratorJob}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="action" value="CANCEL" />
                      <Button className="bg-[#9a6a35] px-3 py-1.5 text-xs hover:bg-[#7d5528]">Cancel</Button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-serif text-xl font-semibold">Review queue</h3>
        <p className="mt-1 text-sm text-stone-600">Suggestions are grouped by plant definition so a human can review the whole record in context.</p>
        <div className="mt-4 grid gap-4">
          {reviewGroups.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm text-stone-600">No AI Curator suggestions are awaiting review.</p>}
          {reviewGroups.map((group) => (
            <div key={group.key} className="rounded-lg border border-stone-200 bg-white/55 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-serif text-lg font-semibold">{group.plantName}</h4>
                  <p className="text-sm text-stone-600">{group.collectionName} · {group.suggestions.length} suggestion(s)</p>
                </div>
                {group.plantDefinitionId && <LinkButton href={`/c/${group.collectionSlug}/plants/${group.plantDefinitionId}/edit`} className="px-3 py-1.5 text-xs">Open definition</LinkButton>}
              </div>
              <div className="mt-3 grid gap-3">
                {group.suggestions.map((suggestion) => <ReviewSuggestionCard key={suggestion.id} suggestion={suggestion} />)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Recent activity</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-500">Accomplishments</h4>
            <div className="mt-2 grid gap-2">
              {dashboard.recentAccomplishments.length === 0 && <p className="text-sm text-stone-600">No completed Curator jobs yet.</p>}
              {dashboard.recentAccomplishments.map((job) => (
                <p key={job.id} className="rounded-lg border border-stone-200 bg-white/55 p-2 text-sm">{job.resultSummary}</p>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-500">Recent errors</h4>
            <div className="mt-2 grid gap-2">
              {dashboard.health.recentErrors.length === 0 && dashboard.recentErrors.length === 0 && <p className="text-sm text-stone-600">No recent Curator blockers.</p>}
              {dashboard.health.recentErrors.map((error, index) => (
                <p key={`worker-${index}`} className="rounded-lg border border-red-200 bg-red-50/80 p-2 text-sm text-red-950">Worker failure: {error}</p>
              ))}
              {dashboard.recentErrors.map((error, index) => (
                <p key={`${error.updatedAt.toISOString()}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50/55 p-2 text-sm text-amber-950">{error.blockingReason}</p>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Collection participation</h3>
        <div className="mt-4 grid gap-2">
          {collections.map((collection) => (
            <div key={collection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/55 p-3">
              <div>
                <p className="font-semibold">{collection.name}</p>
                <p className="text-sm text-stone-600">AI features {collection.aiFeaturesEnabled ? 'enabled' : 'disabled'} · Curator {collection.aiCuratorEnabled ? 'enabled' : 'disabled'}</p>
              </div>
              <LinkButton href="/server/collections" className="px-3 py-1.5 text-xs">Manage</LinkButton>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
