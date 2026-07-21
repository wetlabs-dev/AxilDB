import Link from 'next/link'
import { saveTreatmentDefinition, saveTreatmentProduct, setTreatmentDefinitionActive, setTreatmentProductActive, startTreatmentPlan } from '@/app/treatment-actions'
import { Button, Card, Field, LinkButton, Select, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionGardener } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { labelizeTreatment, summarizeTreatmentEffectiveness, treatmentApplicationMethods, treatmentCategories, treatmentConditionTypes, treatmentDoseUnits } from '@/lib/treatments'
import { plantName } from '@/lib/utils'

function Checklist({ name, values, selected = [] }: { name: string; values: readonly string[]; selected?: string[] }) {
  return <div className="flex flex-wrap gap-2">{values.map((item) => <label key={item} className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white/60 px-2 py-1 text-xs font-medium"><input type="checkbox" name={name} value={item} defaultChecked={selected.includes(item)} />{labelizeTreatment(item)}</label>)}</div>
}

function TreatmentForm({ collectionSlug, treatment, products, tags }: { collectionSlug: string; treatment?: any; products: any[]; tags: any[] }) {
  return <form action={saveTreatmentDefinition} className="grid gap-3 md:grid-cols-3">
    <input type="hidden" name="collectionSlug" value={collectionSlug} />
    {treatment && <input type="hidden" name="id" value={treatment.id} />}
    <Field label="Treatment name" name="name" required defaultValue={treatment?.name} />
    <Select label="Category" name="category" defaultValue={treatment?.category || 'OTHER'}>{treatmentCategories.map((item) => <option key={item} value={item}>{labelizeTreatment(item)}</option>)}</Select>
    <Select label="Application method" name="applicationMethod" defaultValue={treatment?.applicationMethod || ''}><option value="">Not specified</option>{treatmentApplicationMethods.map((item) => <option key={item} value={item}>{labelizeTreatment(item)}</option>)}</Select>
    <TextArea label="Targets / purpose" name="targetSummary" defaultValue={treatment?.targetSummary} wrapperClassName="md:col-span-3" className="min-h-14" />
    <TextArea label="Instructions" name="instructions" defaultValue={treatment?.instructions} wrapperClassName="md:col-span-2" />
    <TextArea label="Manufacturer dose text" name="manufacturerDoseText" defaultValue={treatment?.manufacturerDoseText} className="min-h-20" />
    <Field label="Default dose amount" name="defaultDoseAmount" type="number" min="0" step="any" defaultValue={treatment?.defaultDoseAmount} />
    <Select label="Dose unit" name="defaultDoseUnit" defaultValue={treatment?.defaultDoseUnit || ''}><option value="">Not specified</option>{treatmentDoseUnits.map((item) => <option key={item} value={item}>{labelizeTreatment(item)}</option>)}</Select>
    <Field label="Water volume (mL)" name="defaultWaterVolumeMl" type="number" min="0" step="any" defaultValue={treatment?.defaultWaterVolumeMl} />
    <Field label="Strength note" name="defaultStrength" defaultValue={treatment?.defaultStrength} placeholder="e.g. half label strength" />
    <Field label="Minimum interval (days)" name="minimumIntervalDays" type="number" min="0" max="365" defaultValue={treatment?.minimumIntervalDays} />
    <Field label="Default repeats" name="defaultRepeatCount" type="number" min="0" max="24" defaultValue={treatment?.defaultRepeatCount} />
    <Field label="Repeat interval (days)" name="defaultRepeatIntervalDays" type="number" min="1" max="365" defaultValue={treatment?.defaultRepeatIntervalDays} />
    <Field label="Outcome follow-up (days)" name="defaultFollowUpDays" type="number" min="1" max="365" defaultValue={treatment?.defaultFollowUpDays} />
    <Field label="Re-entry interval (hours)" name="reentryIntervalHours" type="number" min="0" max="720" defaultValue={treatment?.reentryIntervalHours} />
    <Select label="Indoor use" name="indoorUseAllowed" defaultValue={treatment?.indoorUseAllowed == null ? '' : String(treatment.indoorUseAllowed)}><option value="">Not specified</option><option value="true">Allowed</option><option value="false">Not allowed</option></Select>
    <div className="md:col-span-3"><p className="mb-1 text-sm font-medium">Applicable condition types</p><Checklist name="conditionTypes" values={treatmentConditionTypes} selected={treatment?.conditionTypes?.map((item: any) => item.conditionType)} /></div>
    {products.length > 0 && <div className="md:col-span-3"><p className="mb-1 text-sm font-medium">Linked products</p><div className="flex flex-wrap gap-2">{products.map((product) => <label key={product.id} className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white/60 px-2 py-1 text-xs font-medium"><input type="checkbox" name="productIds" value={product.id} defaultChecked={treatment?.products?.some((item: any) => item.productId === product.id)} />{product.name}{product.manufacturer ? ` · ${product.manufacturer}` : ''}</label>)}</div></div>}
    {tags.length > 0 && <div className="md:col-span-3"><p className="mb-1 text-sm font-medium">Plant tag cautions</p><div className="flex flex-wrap gap-2">{tags.map((tag) => <label key={tag.id} className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white/60 px-2 py-1 text-xs"><input type="checkbox" name="cautionTagIds" value={tag.id} defaultChecked={treatment?.cautionTags?.some((item: any) => item.plantTagId === tag.id)} />{tag.name}</label>)}</div></div>}
    <div className="md:col-span-3"><p className="mb-1 text-sm font-medium">PPE</p><Checklist name="ppeRequirements" values={['GLOVES', 'EYE_PROTECTION', 'RESPIRATOR', 'PROTECTIVE_CLOTHING']} selected={Array.isArray(treatment?.ppeRequirementsJson) ? treatment.ppeRequirementsJson : []} /></div>
    <div className="flex flex-wrap gap-3 text-sm font-medium md:col-span-3">
      {[['requiresQuarantine', 'Requires quarantine'], ['ventilationRequired', 'Ventilation required'], ['avoidBlooms', 'Avoid blooms'], ['avoidHeat', 'Avoid heat'], ['avoidDirectLight', 'Avoid direct light']].map(([name, label]) => <label key={name} className="inline-flex items-center gap-2"><input type="checkbox" name={name} defaultChecked={Boolean(treatment?.[name])} />{label}</label>)}
    </div>
    <TextArea label="Safety notes" name="safetyNotes" defaultValue={treatment?.safetyNotes} />
    <TextArea label="Contraindications" name="contraindications" defaultValue={treatment?.contraindications} />
    <Button className="w-fit self-end">{treatment ? 'Save treatment' : 'Create treatment'}</Button>
  </form>
}

export default async function TreatmentsPage({ searchParams }: { searchParams: Promise<{ selected?: string; view?: string; product?: string; plant?: string; condition?: string }> }) {
  const { collection } = await requireCollectionGardener()
  const sp = await searchParams
  const [treatments, products, tags, plants, conditions, plans, untreatedConditions] = await Promise.all([
    prisma.treatmentDefinition.findMany({ where: { collectionId: collection.id }, include: { conditionTypes: true, products: { include: { product: true }, orderBy: { sortOrder: 'asc' } }, cautionTags: true, applications: { include: { outcomes: true } }, planSteps: { include: { plan: { include: { applications: { include: { outcomes: true } } } } } } }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.treatmentProduct.findMany({ where: { collectionId: collection.id }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.plantTag.findMany({ where: { collectionId: collection.id, active: true }, orderBy: { name: 'asc' } }),
    prisma.plantInstance.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, include: { plantDefinition: true }, orderBy: { plantId: 'asc' }, take: 750 }),
    prisma.plantCondition.findMany({ where: { collectionId: collection.id, status: { in: ['OPEN', 'IMPROVING'] } }, include: { plantInstance: { include: { plantDefinition: true } } }, orderBy: { observedAt: 'desc' } }),
    prisma.treatmentPlan.findMany({ where: { collectionId: collection.id }, include: { plantInstance: { include: { plantDefinition: true } }, condition: true, steps: true }, orderBy: { updatedAt: 'desc' }, take: 30 }),
    prisma.plantCondition.findMany({ where: { collectionId: collection.id, treatmentPlans: { none: {} } }, select: { category: true, status: true } }),
  ])
  const selectedTreatment = treatments.find((item) => item.id === sp.selected)
  const selectedProduct = products.find((item) => item.id === sp.product)
  const untreatedByCategory = [...new Set(untreatedConditions.map((item) => item.category))].map((category) => {
    const records = untreatedConditions.filter((item) => item.category === category)
    const resolved = records.filter((item) => item.status === 'RESOLVED').length
    return { category, count: records.length, resolved, rate: records.length ? Math.round((resolved / records.length) * 100) : null }
  }).sort((a, b) => b.count - a.count)
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-3xl font-bold">Treatment Management</h2><p className="mt-1 max-w-3xl text-sm text-stone-600">Plan and document collection-scoped plant treatments. Saved defaults are references only; every application records the actual amount and safety context.</p></div><div className="flex gap-2"><LinkButton href={collectionPath(collection.slug, '/care')}>Care Queue</LinkButton><LinkButton href={collectionPath(collection.slug, '/treatments/apply')} className="bg-[#9a5935] hover:bg-[#7d472c]">One-off application</LinkButton></div></header>
    <Card className="border-amber-200 bg-amber-50/80 text-sm text-amber-950"><strong>Safety:</strong> AxilDB organizes records and reminders; it does not replace the product label, local regulations, or professional advice. Verify compatibility, dose, PPE, ventilation, and re-entry requirements before every application.</Card>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,.9fr)]">
      <div className="space-y-4">
        <Card><h3 className="font-serif text-2xl font-semibold">Treatment library</h3><div className="mt-3 grid gap-3">{treatments.map((treatment) => {
          const planMap = new Map<string, any>(); treatment.planSteps.forEach((step: any) => planMap.set(step.plan.id, step.plan)); const stats = summarizeTreatmentEffectiveness([...planMap.values()])
          return <article key={treatment.id} className="rounded-lg border border-stone-200 bg-white/60 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#2f6b45]">{labelizeTreatment(treatment.category)} · {treatment.active ? 'Active' : 'Archived'}</p><h4 className="font-serif text-xl font-semibold">{treatment.name}</h4>{treatment.targetSummary && <p className="mt-1 text-sm text-stone-600">{treatment.targetSummary}</p>}<p className="mt-2 text-xs text-stone-500">{treatment.conditionTypes.map((item) => labelizeTreatment(item.conditionType)).join(' · ') || 'No condition types set'} · {treatment.products.length} linked product{treatment.products.length === 1 ? '' : 's'}</p><p className="mt-1 text-xs font-semibold text-stone-600">{stats.label}{stats.completed ? ` · ${stats.effective}/${stats.completed} favorable completed plans` : ''}</p></div><div className="flex gap-2"><Link href={collectionPath(collection.slug, `/treatments?selected=${treatment.id}`)} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold">Edit</Link><form action={setTreatmentDefinitionActive}><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={treatment.id} /><input type="hidden" name="active" value={String(!treatment.active)} /><Button className="px-3 py-1.5">{treatment.active ? 'Archive' : 'Activate'}</Button></form></div></div></article>
        })}{treatments.length === 0 && <p className="text-sm text-stone-600">No treatments yet. Create the first reusable treatment definition.</p>}</div></Card>
        <Card><h3 className="font-serif text-2xl font-semibold">Treatment plans</h3><div className="mt-3 grid gap-2">{plans.map((plan) => { const done = plan.steps.filter((step) => step.status === 'COMPLETED').length; return <Link key={plan.id} href={collectionPath(collection.slug, `/treatments/plans/${plan.id}`)} className="rounded-md border border-stone-200 bg-white/60 p-3 hover:border-[#8fa58f]"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{plan.title}</p><p className="text-xs text-stone-600">{plan.plantInstance.plantId} · {plantName(plan.plantInstance.plantDefinition)} · {done}/{plan.steps.length} steps</p></div><span className="rounded-full border border-stone-200 px-2 py-1 text-xs font-bold">{labelizeTreatment(plan.status)}</span></div></Link>})}{plans.length === 0 && <p className="text-sm text-stone-600">No treatment plans yet.</p>}</div></Card>
        <Card><h3 className="font-serif text-2xl font-semibold">Untreated condition baseline</h3><p className="mt-1 text-sm text-stone-600">A descriptive comparison of conditions with no linked treatment plan. This is not a controlled study.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{untreatedByCategory.slice(0, 12).map((item) => <div key={item.category} className="rounded-md border border-stone-200 bg-white/60 p-3 text-sm"><p className="font-semibold">{labelizeTreatment(item.category)}</p><p className="text-xs text-stone-600">{item.resolved}/{item.count} resolved · {item.rate}% observed resolution</p></div>)}{untreatedByCategory.length === 0 && <p className="text-sm text-stone-600">No untreated condition history is available yet.</p>}</div></Card>
      </div>
      <div className="space-y-4">
        <Card><h3 className="font-serif text-2xl font-semibold">{selectedTreatment ? `Edit ${selectedTreatment.name}` : 'Create treatment'}</h3><div className="mt-3"><TreatmentForm collectionSlug={collection.slug} treatment={selectedTreatment} products={products.filter((item) => item.active)} tags={tags} /></div></Card>
        <Card><h3 className="font-serif text-2xl font-semibold">Start a plan</h3><p className="mt-1 text-sm text-stone-600">Choose an open condition when possible so progress and outcomes stay connected.</p><form action={startTreatmentPlan} className="mt-3 grid gap-3"><input type="hidden" name="collectionSlug" value={collection.slug} /><Select label="Plant / open condition" name="plantConditionId" defaultValue={sp.condition || ''}><option value="">Choose plant separately (no condition)</option>{conditions.map((condition) => <option key={condition.id} value={condition.id}>{condition.plantInstance.plantId} · {labelizeTreatment(condition.category)} · {labelizeTreatment(condition.severity)}</option>)}</Select><Select label="Plant" name="plantInstanceId" required={!sp.condition} defaultValue={sp.plant || ''}><option value="">Select plant</option>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.plantId} · {plantName(plant.plantDefinition)}</option>)}</Select><p className="text-xs text-stone-500">A selected condition determines its plant automatically.</p><Select label="Treatment" name="treatmentDefinitionId" required>{treatments.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Field label="Start date" name="startAt" type="date" /><div className="grid grid-cols-3 gap-2"><Field label="Repeats" name="repeatCount" type="number" min="0" max="24" /><Field label="Every days" name="repeatIntervalDays" type="number" min="1" max="365" /><Field label="Follow-up days" name="followUpDays" type="number" min="1" max="365" /></div><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="replaceExisting" />Replace an existing active plan for this condition</label><Button>Start plan</Button></form></Card>
        <Card>
          <h3 className="font-serif text-2xl font-semibold">Treatment products</h3>
          <div className="mt-3 grid gap-2">{products.map((product) => <div key={product.id} className="flex items-start justify-between gap-2 rounded-md border border-stone-200 bg-white/60 p-2 text-sm"><div><strong>{product.name}</strong>{product.manufacturer && <span> · {product.manufacturer}</span>}<p className="text-xs text-stone-500">{product.activeIngredient || 'Active ingredient not recorded'}{product.expirationDate ? ` · expires ${product.expirationDate.toLocaleDateString()}` : ''} · {product.active ? 'active' : 'archived'}</p></div><div className="flex gap-2"><Link href={collectionPath(collection.slug, `/treatments?view=products&product=${product.id}`)} className="text-xs font-semibold text-[#2f6b45] underline">Edit</Link><form action={setTreatmentProductActive}><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={product.id} /><input type="hidden" name="active" value={String(!product.active)} /><button className="text-xs font-semibold text-[#2f6b45] underline">{product.active ? 'Archive' : 'Activate'}</button></form></div></div>)}</div>
          <details open={sp.view === 'products'} className="mt-3 rounded-md border border-stone-200 p-3">
            <summary className="cursor-pointer font-semibold">{selectedProduct ? `Edit ${selectedProduct.name}` : 'Add product'}</summary>
            <form action={saveTreatmentProduct} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="collectionSlug" value={collection.slug} />{selectedProduct && <input type="hidden" name="id" value={selectedProduct.id} />}
              <Field label="Name" name="name" required defaultValue={selectedProduct?.name} /><Field label="Manufacturer" name="manufacturer" defaultValue={selectedProduct?.manufacturer} />
              <Field label="Product type" name="productType" defaultValue={selectedProduct?.productType} /><Field label="Active ingredient" name="activeIngredient" defaultValue={selectedProduct?.activeIngredient} />
              <Field label="Concentration" name="concentration" defaultValue={selectedProduct?.concentration} /><Field label="Form" name="form" defaultValue={selectedProduct?.form} />
              <Field label="Registration number" name="registrationNumber" defaultValue={selectedProduct?.registrationNumber} /><Field label="Container size" name="containerSize" defaultValue={selectedProduct?.containerSize} />
              <Field label="Lot number" name="lotNumber" defaultValue={selectedProduct?.lotNumber} /><Field label="Storage location" name="storageLocation" defaultValue={selectedProduct?.storageLocation} />
              <Field label="Purchase date" name="purchaseDate" type="date" defaultValue={selectedProduct?.purchaseDate?.toISOString().slice(0, 10)} /><Field label="Expiration date" name="expirationDate" type="date" defaultValue={selectedProduct?.expirationDate?.toISOString().slice(0, 10)} />
              <Field label="Label URL" name="labelUrl" type="url" defaultValue={selectedProduct?.labelUrl} /><Field label="Safety data sheet URL" name="safetyDataSheetUrl" type="url" defaultValue={selectedProduct?.safetyDataSheetUrl} />
              <TextArea label="Label notes" name="labelNotes" wrapperClassName="sm:col-span-2" defaultValue={selectedProduct?.labelNotes} /><Button className="w-fit">{selectedProduct ? 'Save product' : 'Create product'}</Button>
            </form>
          </details>
        </Card>
      </div>
    </div>
  </div>
}
