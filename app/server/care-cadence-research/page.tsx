import { isActionableCadenceProposal } from '@/lib/cadence-review'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireServerAdmin } from '@/lib/auth'
import {
  cadenceActivities,
  evaluateCareScheduleCompleteness,
} from '@/lib/care-cadences'
import {
  cadenceActivityState,
  definitionHasRecipe,
  missingActivities,
  researchDefinitionInclude,
} from '@/lib/cadence-research'
import { plantName } from '@/lib/utils'
import { collectionPath } from '@/lib/collection-path'
import {
  CadenceProposalReview,
  CadenceResearchControls,
  CadenceResearchRefresh,
} from '@/components/CadenceResearchControls'
import {
  manageCadenceJob,
  researchMissingCadences,
} from '@/app/cadence-research-actions'

export default async function CadenceResearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireServerAdmin()
  const q = await searchParams
  const selectedCollection = q.collection
    ? await prisma.collection.findUnique({
        where: { slug: q.collection },
        select: { id: true, name: true },
      })
    : null
  if (q.collection && !selectedCollection) notFound()
  const collectionQuery = q.collection
    ? `&collection=${encodeURIComponent(q.collection)}`
    : ''
  const tab = ['review', 'history'].includes(q.tab || '') ? q.tab : 'research'
  const [definitions, jobs] = await Promise.all([
    prisma.plantDefinition.findMany({
      where: selectedCollection ? { collectionId: selectedCollection.id } : {},
      include: {
        ...researchDefinitionInclude,
        cadenceProposals: { include: { job: { select: { status: true } } } },
        collection: {
          select: {
            slug: true,
            status: true,
            aiFeaturesEnabled: true,
            aiCuratorEnabled: true,
          },
        },
      },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }],
    }),
    prisma.aiCuratorJob.findMany({
      where: {
        targetField: 'careCadences',
        ...(selectedCollection ? { collectionId: selectedCollection.id } : {}),
      },
      include: { _count: { select: { cadenceProposals: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const all = definitions.flatMap((d) =>
    d.cadenceProposals.map((p) => ({ ...p, definition: d }))
  )
  const states = definitions.flatMap((d) =>
    cadenceActivities.map((a) => cadenceActivityState(d, a.activity))
  )
  const enabled = definitions.filter(
    (d) =>
      d.collection?.status === 'ACTIVE' &&
      d.collection.aiFeaturesEnabled &&
      d.collection.aiCuratorEnabled
  )
  const stats = [
    ['Plant Definitions', definitions.length],
    [
      'Complete care schedules',
      definitions.filter(
        (d) =>
          evaluateCareScheduleCompleteness(
            d.careCadences,
            [],
            definitionHasRecipe(d)
          ).complete
      ).length,
    ],
    [
      'Definitions needing research',
      enabled.filter((d) => missingActivities(d).length).length,
    ],
    [
      'Missing eligible cadences',
      enabled.reduce((sum, d) => sum + missingActivities(d).length, 0),
    ],
    [
      'Recommendations awaiting review',
      all.filter((p) => isActionableCadenceProposal(p, p.definition)).length,
    ],
    ['Previously approved', all.filter((p) => p.status === 'APPROVED').length],
    [
      'Research failures',
      jobs.filter((j) => j.status === 'WAITING_FOR_HUMAN').length,
    ],
    ['Configured', states.filter((s) => s === 'CONFIGURED').length],
    [
      'Blocked by dependency',
      states.filter((s) => s === 'BLOCKED_BY_DEPENDENCY').length,
    ],
    [
      'Not applicable',
      states.filter((s) => s === 'NOT_APPLICABLE_CONFIGURED').length,
    ],
    [
      'Insufficient information',
      states.filter((s) => s === 'INSUFFICIENT_INFORMATION').length,
    ],
  ]
  const rows = all.filter(
    (p) =>
      (tab === 'history'
        ? !isActionableCadenceProposal(p, p.definition)
        : isActionableCadenceProposal(p, p.definition)) &&
      (!q.definition || p.plantDefinitionId === q.definition) &&
      (!q.activity || p.activity === q.activity) &&
      (!q.confidence || p.confidence === q.confidence) &&
      (!q.status || p.status === q.status) &&
      (!q.source || p.source === q.source)
  )
  rows.sort((a, b) =>
    q.sort === 'date'
      ? b.researchedAt.getTime() - a.researchedAt.getTime()
      : q.sort === 'activity'
        ? a.activity.localeCompare(b.activity)
        : q.sort === 'confidence'
          ? ['HIGH', 'MEDIUM', 'LOW'].indexOf(a.confidence) -
            ['HIGH', 'MEDIUM', 'LOW'].indexOf(b.confidence)
          : plantName(a.definition).localeCompare(plantName(b.definition))
  )
  function proposal(p: (typeof rows)[number]) {
    const actionable = isActionableCadenceProposal(p, p.definition)
    return (
      <div key={p.id} className="space-y-2 rounded-lg border p-3">
        <p className="font-semibold">
          {p.activity.replaceAll('_', ' ')} ·{' '}
          {p.interval
            ? `Every ${p.interval} ${p.unit?.toLowerCase()}${p.interval === 1 ? '' : 's'}`
            : p.applicability.replaceAll('_', ' ')}
        </p>
        <p className="text-sm">
          Confidence: {p.confidence.toLowerCase()} · {p.status} ·{' '}
          {p.source === 'LEGACY_RECOVERY'
            ? 'Recovered from previous cadence data'
            : p.source.replaceAll('_', ' ')}{' '}
          · {p.researchedAt.toISOString().slice(0, 10)}
          {p.model && ` · ${p.model}`}
        </p>
        <p>{p.rationale}</p>
        <div className="flex flex-wrap gap-3">
          {(Array.isArray(p.sourceReferences) ? p.sourceReferences : []).map(
            (r: any, i) =>
              r.url && /^https?:\/\//i.test(r.url) ? (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {r.title || 'Source'}
                </a>
              ) : null
          )}
        </div>
        {p.status === 'APPROVED' && p.applicability === 'NOT_APPLICABLE' && (
          <p>
            Approved: Not applicable ·{' '}
            {p.reviewedAt?.toISOString().slice(0, 10)}
          </p>
        )}
        {p.approvedInterval && (
          <p>
            Approved: {p.approvedInterval} {p.approvedUnit?.toLowerCase()} ·{' '}
            {p.reviewedAt?.toISOString().slice(0, 10)}
          </p>
        )}
        {p.reviewNote && <p>{p.reviewNote}</p>}
        {p.status === 'PENDING' && (
          <>
            <CadenceProposalReview
              id={p.id}
              interval={p.interval}
              unit={p.unit}
              actionable={actionable}
            />
            {p.applicability === 'RECOMMENDED' && !actionable && (
              <p>
                No longer actionable: check research status, the proposed
                interval, existing cadences and the assigned fertilizer recipe.
              </p>
            )}
          </>
        )}
      </div>
    )
  }
  const active = jobs.some((j) =>
    ['QUEUED', 'RUNNING', 'DEFERRED'].includes(j.status)
  )
  return (
    <div className="space-y-6 [&_select]:max-w-full [&_select]:rounded-md [&_select]:border [&_select]:p-2 [&_label]:grid [&_label]:gap-1 [&_button]:rounded-md [&_button]:border [&_button]:border-stone-300 [&_button]:px-3 [&_button]:py-2 [&_button]:font-semibold [&_button:disabled]:opacity-50">
      <CadenceResearchRefresh active={active} />
      <Link href="/server" className="underline">
        Server Management
      </Link>
      <h1 className="text-3xl font-bold">Care Cadence Research</h1>
      <p>
        Research creates proposals. Approval applies scheduled or not applicable
        decisions; specimens inherit through their existing care settings.
      </p>
      <CadenceResearchControls collectionId={selectedCollection?.id} />
      {selectedCollection && (
        <p>
          Reviewing {selectedCollection.name}. The collection filter applies to
          this list and bulk approval.{' '}
          <Link
            href={`/server/care-cadence-research?tab=${tab}`}
            className="underline"
          >
            All collections
          </Link>
        </p>
      )}
      <nav className="flex gap-4">
        {['research', 'review', 'history'].map((t) => (
          <Link
            key={t}
            className={t === tab ? 'font-bold underline' : 'underline'}
            href={`/server/care-cadence-research?tab=${t}${collectionQuery}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </nav>
      {tab === 'research' ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {stats.map(([label, count]) => (
              <div key={label} className="rounded-lg border p-4">
                <dt>{label}</dt>
                <dd className="text-2xl font-bold">{count}</dd>
              </div>
            ))}
          </dl>
          <p>
            Only active collections with AI features and AI Curator enabled are
            queued. Enable the AI Curator worker in Server Management. Priority
            jobs run ahead of ordinary pending work within the same budgets and
            concurrency limits.
          </p>
          <h2 className="text-xl font-bold">Persistent progress</h2>
          <p>
            {new Set(jobs.map((j) => j.plantDefinitionId)).size} distinct
            definitions · {jobs.length} research jobs over all runs ·{' '}
            {jobs.filter((j) => j.status === 'COMPLETED').length} completed ·{' '}
            {jobs.filter((j) => j.status === 'RUNNING').length} processing ·{' '}
            {
              jobs.filter((j) => ['QUEUED', 'DEFERRED'].includes(j.status))
                .length
            }{' '}
            waiting ·{' '}
            {jobs.filter((j) => j.status === 'WAITING_FOR_HUMAN').length} failed
            · {jobs.reduce((sum, j) => sum + j._count.cadenceProposals, 0)}{' '}
            proposals generated
          </p>
          <div className="space-y-3">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="flex flex-wrap gap-3 rounded-lg border p-3"
              >
                <span>
                  {plantName(
                    definitions.find((d) => d.id === j.plantDefinitionId) || {
                      genus: 'Deleted definition',
                    }
                  )}{' '}
                  · {j.status} · attempt {j.attempts}/{j.maxAttempts}
                </span>
                <span>{j.resultSummary || j.blockingReason}</span>
                <form action={manageCadenceJob}>
                  <input type="hidden" name="id" value={j.id} />
                  {['WAITING_FOR_HUMAN', 'CANCELLED', 'EXPIRED'].includes(
                    j.status
                  ) ? (
                    <>
                      <input type="hidden" name="decision" value="retry" />
                      <button>Retry</button>
                    </>
                  ) : ['QUEUED', 'DEFERRED', 'RUNNING'].includes(j.status) ? (
                    <>
                      <input type="hidden" name="decision" value="cancel" />
                      <button>Cancel</button>
                    </>
                  ) : null}
                </form>
              </div>
            ))}
          </div>
          <details>
            <summary>Explicit re-research</summary>
            <p>
              Revisit rejected, not-applicable or insufficient results. Pending
              actionable proposals should be reviewed first.
            </p>
            <form
              action={async (fd) => {
                'use server'
                await researchMissingCadences(fd)
              }}
            >
              <input type="hidden" name="explicit" value="yes" />
              <select name="definitionId" required>
                <option value="">Choose definition</option>
                {enabled.map((d) => (
                  <option value={d.id} key={d.id}>
                    {plantName(d)}
                  </option>
                ))}
              </select>
              <button>Re-research</button>
            </form>
          </details>
        </>
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value={tab} />
            {q.collection && (
              <input type="hidden" name="collection" value={q.collection} />
            )}
            <label>
              Definition
              <select name="definition" defaultValue={q.definition || ''}>
                <option value="">All</option>
                {definitions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {plantName(d)}
                  </option>
                ))}
              </select>
            </label>
            {[
              ['activity', cadenceActivities.map((a) => a.activity)],
              ['confidence', ['HIGH', 'MEDIUM', 'LOW']],
              [
                'status',
                ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'FAILED'],
              ],
              [
                'source',
                [
                  'MAGIC_FILL',
                  'AI_RESEARCH',
                  'BULK_RESEARCH',
                  'LEGACY_RECOVERY',
                ],
              ],
              ['sort', ['name', 'activity', 'date', 'confidence']],
              ['view', ['grouped', 'table']],
            ].map(([name, options]) => (
              <label key={name as string}>
                {name}
                <select
                  name={name as string}
                  defaultValue={q[name as string] || ''}
                >
                  <option value="">All / default</option>
                  {(options as string[]).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            ))}
            <button>Filter</button>
          </form>
          <p>{rows.length} recommendations</p>
          {tab === 'review' && (
            <p>
              Only currently actionable schedules and N/A decisions are shown.
              Blocked and resolved proposals remain in History.
            </p>
          )}
          {q.view === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      'Plant Definition',
                      'Activity',
                      'Proposed cadence',
                      'Confidence',
                      'Status',
                      'Review',
                    ].map((t) => (
                      <th key={t} className="p-2 text-left">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="p-2">{plantName(p.definition)}</td>
                      <td>{p.activity.replaceAll('_', ' ')}</td>
                      <td>
                        {p.applicability === 'NOT_APPLICABLE'
                          ? 'Not applicable'
                          : `${p.interval ?? ''} ${p.unit || p.applicability}`}
                      </td>
                      <td>{p.confidence}</td>
                      <td>{p.status}</td>
                      <td>
                        <details>
                          <summary>Details / review</summary>
                          {proposal(p)}
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            definitions
              .filter((d) => rows.some((p) => p.plantDefinitionId === d.id))
              .map((d) => (
                <section
                  key={d.id}
                  className="space-y-3 rounded-xl border bg-white p-4"
                >
                  <h2 className="text-xl font-bold">
                    {d.collection ? (
                      <Link
                        href={collectionPath(
                          d.collection.slug,
                          `/plants/${d.id}/husbandry`
                        )}
                      >
                        {plantName(d)}
                      </Link>
                    ) : (
                      plantName(d)
                    )}
                  </h2>
                  {rows
                    .filter((p) => p.plantDefinitionId === d.id)
                    .map(proposal)}
                </section>
              ))
          )}
        </>
      )}
    </div>
  )
}
