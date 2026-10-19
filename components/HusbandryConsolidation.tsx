import { prisma } from '@/lib/prisma'
import {
  compatibilityDimensions,
  guideQuality,
  husbandryGraphIssues,
  activeLinkWhere,
} from '@/lib/husbandry-consolidation'
import {
  reviewHusbandryLinkBatch,
  requestAiCuratorResearchNow,
  reviewAiCuratorSuggestion,
} from '@/app/ai-curator-actions'
import { Button, Card } from '@/components/ui'
import { plantName } from '@/lib/utils'
export function HusbandryLinkComparison({
  value,
  context,
}: {
  value: any
  context: any
}) {
  const source = context?.candidates?.find(
      (c: any) => c.id === value?.sourcePlantDefinitionId
    ),
    target = context?.target
  if (!source)
    return (
      <p>
        Existing independent husbandry is retained until an evidence-backed
        source is approved.
      </p>
    )
  const targetQuality = guideQuality(target?.guide)
  return (
    <div className="space-y-3 break-words">
      <h4 className="font-semibold">Husbandry consolidation → {source.name}</h4>
      <p>
        Target guide covers {targetQuality.covered.length}/12 comparison
        dimensions; proposed source covers {source.quality.covered.length}/12.
        Compatibility confidence: {Math.round(value.confidence * 100)}%.
      </p>
      <p>{value.botanicalReasoning}</p>
      <p>Source quality: {value.sourceQualityAssessment}</p>
      <p>Evidence limitations: {value.evidenceLimitations}</p>
      <h5 className="font-semibold">Supporting similarities</h5>
      <ul>
        {value.similarities?.map((s: string, i: number) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h5 className="font-semibold">Minor differences</h5>
      <ul>
        {value.minorDifferences?.map((s: string, i: number) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <p>
        This definition will use the source’s husbandry. Its independent guide
        will be preserved. Care cadences, repotting windows, substrate
        assignments and instance overrides remain independently owned. The
        existing linked guide’s fertilizer guidance is shared according to
        current husbandry behavior.
      </p>
      <details>
        <summary>View side-by-side care comparison</summary>
        <div className="grid gap-2">
          {Object.entries(compatibilityDimensions).map(
            ([dimension, fields]) => {
              const a = fields
                  .map((f) => target?.guide?.[f])
                  .filter((v) => v != null && v !== ''),
                b = fields
                  .map((f) => source.snapshot.guide?.[f])
                  .filter((v) => v != null && v !== '')
              return (
                <div key={dimension} className="rounded border p-2">
                  <h5 className="font-semibold">
                    {dimension} ·{' '}
                    {JSON.stringify(a) === JSON.stringify(b)
                      ? 'Identical stored guidance'
                      : 'Compare differences'}
                    {!b.length ? ' · Missing source detail' : ''}
                  </h5>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p>Target: {a.join(' · ') || 'Not recorded'}</p>
                    <p>Source: {b.join(' · ') || 'Not recorded'}</p>
                  </div>
                </div>
              )
            }
          )}
        </div>
      </details>
    </div>
  )
}
export async function HusbandryConsolidationPanel() {
  const [pending, stale, collections] = await Promise.all([
    prisma.aiCuratorSuggestion.findMany({
      where: activeLinkWhere(),
      take: 50,
      orderBy: { createdAt: 'asc' },
      include: { plantDefinition: true },
    }),
    prisma.aiCuratorSuggestion.findMany({
      where: { targetField: 'husbandryLink', status: 'STALE' },
      take: 20,
      orderBy: { updatedAt: 'desc' },
      include: { plantDefinition: true, collection: true },
    }),
    prisma.collection.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      take: 100,
    }),
  ])
  const issues = []
  for (const c of collections) {
    const rows = await husbandryGraphIssues(prisma, c.id)
    for (const reason of rows) issues.push(`${c.name}: ${reason}`)
  }
  return (
    <Card>
      <h3 className="font-serif text-xl">Husbandry consolidation</h3>
      <p>
        Full and partial guides can be compared. Sources remain independent, and
        a single critical cultivation conflict prevents a recommendation.
        Research Now includes a bounded source comparison under the ordinary AI
        budget.
      </p>
      {pending.length > 0 && (
        <details>
          <summary>Batch review (up to 50 pending comparisons)</summary>
          <form action={reviewHusbandryLinkBatch} className="space-y-2">
            {pending.map((p) => (
              <label key={p.id} className="block">
                <input type="checkbox" name="suggestionId" value={p.id} />
                {p.plantDefinition
                  ? plantName(p.plantDefinition)
                  : p.title} · {p.title}
              </label>
            ))}
            <p>
              Inspect each comparison below before selecting it. Each approval
              is revalidated and applied atomically; conflicting links are
              skipped while unrelated valid work continues.
            </p>
            <label>
              <input type="checkbox" name="confirmed" required /> I reviewed and
              confirm the selected recommendations.
            </label>
            <div className="flex gap-2">
              <Button name="action" value="ACCEPT">
                Approve selected links
              </Button>
              <Button name="action" value="REJECT">
                Reject selected links
              </Button>
            </div>
          </form>
        </details>
      )}
      {stale.length > 0 && (
        <details open>
          <summary>Stale comparisons · showing {stale.length}</summary>
          {stale.map((p) => (
            <div key={p.id} className="mt-2 rounded border p-2">
              <p className="font-semibold">{p.title}</p>
              <p>{p.reviewNote} No link was applied.</p>
              {p.plantDefinitionId && (
                <form action={requestAiCuratorResearchNow}>
                  <input
                    type="hidden"
                    name="collectionSlug"
                    value={p.collection.slug}
                  />
                  <input
                    type="hidden"
                    name="plantDefinitionId"
                    value={p.plantDefinitionId}
                  />
                  <input type="hidden" name="back" value="/server/ai-curator" />
                  <Button>Refresh comparison</Button>
                </form>
              )}
              <form action={reviewAiCuratorSuggestion}>
                <input type="hidden" name="suggestionId" value={p.id} />
                <Button name="action" value="REJECT">
                  Reject stale recommendation
                </Button>
              </form>
            </div>
          ))}
        </details>
      )}
      {issues.length > 0 && (
        <details>
          <summary>Existing dependency issues · {issues.length}</summary>
          <p>
            Legacy relationships are reported without rewriting them. Review
            them manually before further consolidation.
          </p>
          {issues.slice(0, 100).map((issue, i) => (
            <p key={i}>{issue}</p>
          ))}
        </details>
      )}
    </Card>
  )
}
