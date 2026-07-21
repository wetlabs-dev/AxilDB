import { recordTreatmentApplication } from '@/app/treatment-actions'
import { Button, Card, Field, LinkButton, Select, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionLogger } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { labelizeTreatment, treatmentApplicationMethods, treatmentDoseUnits, treatmentSafetyWarnings } from '@/lib/treatments'
import { plantName } from '@/lib/utils'

export default async function TreatmentApplyPage({ searchParams }: { searchParams: Promise<{ plant?: string; treatment?: string; condition?: string }> }) {
  const { collection } = await requireCollectionLogger()
  const sp = await searchParams
  const [plants, treatments, conditions] = await Promise.all([
    prisma.plantInstance.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, include: { plantDefinition: true }, orderBy: { plantId: 'asc' }, take: 750 }),
    prisma.treatmentDefinition.findMany({ where: { collectionId: collection.id, active: true }, include: { conditionTypes: true, products: { include: { product: true }, orderBy: { sortOrder: 'asc' } }, cautionTags: true }, orderBy: { name: 'asc' } }),
    prisma.plantCondition.findMany({ where: { collectionId: collection.id, status: { in: ['OPEN', 'IMPROVING'] } }, orderBy: { observedAt: 'desc' } }),
  ])
  const plant = plants.find((item) => item.id === sp.plant)
  const treatment = treatments.find((item) => item.id === sp.treatment)
  const condition = conditions.find((item) => item.id === sp.condition && item.plantInstanceId === plant?.id)
  let warnings: Array<{ severity: 'INFO' | 'WARNING' | 'BLOCKING'; message: string }> = []
  if (plant && treatment) {
    const [activeBloom, activeQuarantine, lastApplication, tagAssignments] = await Promise.all([
      prisma.bloomEvent.findFirst({ where: { collectionId: collection.id, plantInstanceId: plant.id, bloomEndDate: null }, select: { id: true } }),
      prisma.plantQuarantine.findFirst({ where: { collectionId: collection.id, plantInstanceId: plant.id, status: 'ACTIVE' }, select: { id: true } }),
      prisma.treatmentApplication.findFirst({ where: { collectionId: collection.id, plantInstanceId: plant.id, treatmentDefinitionId: treatment.id }, orderBy: { appliedAt: 'desc' }, select: { appliedAt: true } }),
      prisma.plantDefinitionTag.findMany({ where: { plantDefinitionId: plant.plantDefinitionId }, select: { plantTagId: true } }),
    ])
    const tagIds = new Set(tagAssignments.map((item) => item.plantTagId))
    warnings = treatmentSafetyWarnings({ treatment, conditionCategory: condition?.category, applicableConditionTypes: treatment.conditionTypes.map((item) => item.conditionType), tagCautions: treatment.cautionTags.filter((item) => tagIds.has(item.plantTagId)), activeBloom: Boolean(activeBloom), activeQuarantine: Boolean(activeQuarantine), lastAppliedAt: lastApplication?.appliedAt })
  }
  return <div className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-3xl font-bold">Record treatment application</h2><p className="mt-1 text-sm text-stone-600">Select the plant and treatment first. AxilDB will show deterministic compatibility and interval warnings before entry.</p></div><LinkButton href={collectionPath(collection.slug, '/treatments')}>Treatment Management</LinkButton></header>
    <Card><form method="get" className="grid gap-3 md:grid-cols-3"><Select label="Plant" name="plant" defaultValue={plant?.id || ''}><option value="">Select plant</option>{plants.map((item) => <option key={item.id} value={item.id}>{item.plantId} · {plantName(item.plantDefinition)}</option>)}</Select><Select label="Treatment" name="treatment" defaultValue={treatment?.id || ''}><option value="">Select treatment</option>{treatments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select label="Open condition (optional)" name="condition" defaultValue={condition?.id || ''}><option value="">No linked condition</option>{conditions.filter((item) => !plant || item.plantInstanceId === plant.id).map((item) => <option key={item.id} value={item.id}>{labelizeTreatment(item.category)} · {labelizeTreatment(item.severity)}</option>)}</Select><Button className="w-fit md:col-span-3">Review application</Button></form></Card>
    {plant && treatment && <Card>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#2f6b45]">{plant.plantId}</p><h3 className="font-serif text-2xl font-semibold">{treatment.name}</h3><p className="text-sm text-stone-600">{plantName(plant.plantDefinition)}{condition ? ` · ${labelizeTreatment(condition.category)} condition` : ''}</p></div><span className="rounded-full border border-stone-200 bg-white/60 px-3 py-1 text-xs font-bold">{labelizeTreatment(treatment.category)}</span></div>
      {warnings.length > 0 && <div className="mt-4 grid gap-2">{warnings.map((warning, index) => <p key={index} className={warning.severity === 'BLOCKING' ? 'rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-950' : warning.severity === 'WARNING' ? 'rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950' : 'rounded-md border border-sky-200 bg-sky-50 p-2 text-sm text-sky-950'}><strong>{labelizeTreatment(warning.severity)}:</strong> {warning.message}</p>)}</div>}
      <form action={recordTreatmentApplication} className="mt-4 grid gap-3 md:grid-cols-3"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="plantInstanceId" value={plant.id} /><input type="hidden" name="plantConditionId" value={condition?.id || ''} /><input type="hidden" name="treatmentDefinitionId" value={treatment.id} />
        <Select label="Product" name="treatmentProductId" defaultValue={treatment.products[0]?.product.id || ''}><option value="">No product recorded</option>{treatment.products.map((item) => <option key={item.product.id} value={item.product.id}>{item.product.name}</option>)}</Select>
        <Field label="Applied at" name="appliedAt" type="datetime-local" />
        <Select label="Application method" name="applicationMethod" defaultValue={treatment.applicationMethod || ''}><option value="">Not recorded</option>{treatmentApplicationMethods.map((item) => <option key={item} value={item}>{labelizeTreatment(item)}</option>)}</Select>
        <Field label="Actual dose amount" name="doseAmount" type="number" min="0" step="any" placeholder={treatment.defaultDoseAmount != null ? `Saved reference: ${treatment.defaultDoseAmount}` : ''} />
        <Select label="Actual dose unit" name="doseUnit" defaultValue={treatment.defaultDoseUnit || ''}><option value="">Not recorded</option>{treatmentDoseUnits.map((item) => <option key={item} value={item}>{labelizeTreatment(item)}</option>)}</Select>
        <Field label="Actual water volume (mL)" name="waterVolumeMl" type="number" min="0" step="any" placeholder={treatment.defaultWaterVolumeMl != null ? `Saved reference: ${treatment.defaultWaterVolumeMl}` : ''} />
        <Field label="Actual strength" name="strength" placeholder={treatment.defaultStrength ? `Saved reference: ${treatment.defaultStrength}` : ''} />
        <TextArea label="Application notes" name="notes" wrapperClassName="md:col-span-2" />
        <div className="space-y-2 md:col-span-3"><label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="adverseReaction" />Adverse reaction observed during application</label>{warnings.length > 0 && <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-medium"><input className="mt-1" type="checkbox" name="acknowledgeWarnings" required />I reviewed these warnings and verified the product label, dose, PPE, environment, and local requirements.</label>}</div>
        <Button className="w-fit md:col-span-3">Record application</Button>
      </form>
    </Card>}
  </div>
}
