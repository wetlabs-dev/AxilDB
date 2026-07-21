import { Card, LinkButton, Select } from '@/components/ui'
import { collectionPath, requireCollectionGardener } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { labelizeTreatment, summarizeTreatmentEffectiveness } from '@/lib/treatments'
import { formatDate } from '@/lib/time'

export default async function TreatmentReportsPage({ searchParams }: { searchParams: Promise<{ treatment?: string; status?: string; outcome?: string }> }) {
  const { collection } = await requireCollectionGardener()
  const sp = await searchParams
  const [treatments, plans, applications] = await Promise.all([
    prisma.treatmentDefinition.findMany({ where: { collectionId: collection.id }, orderBy: { name: 'asc' } }),
    prisma.treatmentPlan.findMany({ where: { collectionId: collection.id, ...(sp.status ? { status: sp.status } : {}), ...(sp.outcome ? { finalOutcome: sp.outcome } : {}), ...(sp.treatment ? { steps: { some: { treatmentDefinitionId: sp.treatment } } } : {}) }, include: { condition: true, plantInstance: { include: { currentLocation: true, plantDefinition: true } }, steps: { orderBy: { scheduledAt: 'asc' } }, applications: { include: { outcomes: true } } }, orderBy: { updatedAt: 'desc' } }),
    prisma.treatmentApplication.findMany({ where: { collectionId: collection.id, ...(sp.treatment ? { treatmentDefinitionId: sp.treatment } : {}) }, include: { treatment: true, condition: true }, orderBy: { appliedAt: 'desc' } }),
  ])
  const grouped = treatments.map((treatment) => {
    const treatmentPlans = plans.filter((plan) => plan.steps.some((step) => step.treatmentDefinitionId === treatment.id))
    const stats = summarizeTreatmentEffectiveness(treatmentPlans)
    const uses = applications.filter((application) => application.treatmentDefinitionId === treatment.id)
    return { treatment, plans: treatmentPlans.length, applications: uses.length, plants: new Set(uses.map((item) => item.plantInstanceId)).size, stats }
  }).filter((item) => item.plans || item.applications)
  const active = plans.filter((plan) => plan.status === 'ACTIVE')
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-3xl font-bold">Treatment reports</h2><p className="mt-1 text-sm text-stone-600">Descriptive outcomes recorded in this collection. These are observational records, not scientific efficacy claims.</p></div><div className="flex gap-2"><LinkButton href={`/api/exports/treatments?collectionSlug=${encodeURIComponent(collection.slug)}`}>Download CSV</LinkButton><LinkButton href={collectionPath(collection.slug, '/treatments')}>Treatment Management</LinkButton></div></header>
    <Card><form className="grid gap-3 sm:grid-cols-3"><Select label="Treatment" name="treatment" defaultValue={sp.treatment || ''}><option value="">All treatments</option>{treatments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select label="Plan status" name="status" defaultValue={sp.status || ''}><option value="">Any status</option>{['ACTIVE', 'COMPLETED', 'CANCELLED'].map((item) => <option key={item}>{item}</option>)}</Select><Select label="Final outcome" name="outcome" defaultValue={sp.outcome || ''}><option value="">Any outcome</option>{['RESOLVED', 'IMPROVED', 'UNCHANGED', 'WORSENED', 'STOPPED_ADVERSE_REACTION', 'UNCERTAIN'].map((item) => <option key={item}>{item}</option>)}</Select><button className="w-fit rounded-md bg-[#2f6b45] px-4 py-2 font-semibold text-white">Apply filters</button></form></Card>
    <Card><h3 className="font-serif text-2xl font-semibold">Usage and outcomes</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{grouped.map(({ treatment, plans: count, applications: uses, plants, stats }) => <div key={treatment.id} className="rounded-md border border-stone-200 bg-white/60 p-3"><p className="font-semibold">{treatment.name}</p><p className="text-sm">{uses} applications · {count} plans · {plants} plants</p><p className="mt-1 text-xs text-stone-600">{stats.effective}/{stats.completed} favorable evaluable plans · {stats.adverse} adverse reactions</p><p className="text-xs font-semibold text-stone-600">{stats.showPercentage ? `${stats.rate}% observed improvement-or-resolution · ` : ''}{stats.sampleLabel}</p></div>)}{!grouped.length && <p className="text-sm text-stone-600">No matching treatment history.</p>}</div></Card>
    <Card><h3 className="font-serif text-2xl font-semibold">Active treatment plans</h3><div className="mt-3 grid gap-2">{active.map((plan) => { const pending = plan.steps.filter((step) => step.status === 'PENDING'); const next = pending[0]; const overdue = pending.filter((step) => step.scheduledAt < new Date()).length; return <a key={plan.id} href={collectionPath(collection.slug, `/treatments/plans/${plan.id}`)} className="rounded-md border border-stone-200 bg-white/60 p-3"><strong>{plan.title}</strong><p className="text-sm">{plan.plantInstance.plantId} · {labelizeTreatment(plan.condition?.category)} · {plan.plantInstance.currentLocation?.name || 'No location'}</p><p className="text-xs text-stone-600">Next: {next ? `${next.title} on ${formatDate(next.scheduledAt)}` : 'No pending step'} · {overdue} overdue</p></a>})}{!active.length && <p className="text-sm text-stone-600">No active plans.</p>}</div></Card>
  </div>
}
