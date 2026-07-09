import Link from 'next/link'
import {
  archiveFertilizerProduct,
  archiveFertilizerRecipe,
  createFertilizerProduct,
  createFertilizerRecipe,
  markFertilizerProductReviewed,
  updateFertilizerProduct,
  updateFertilizerRecipe,
} from '@/app/actions'
import { FertilizerProductMagicFillButton } from '@/components/FertilizerProductMagicFillButton'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionGardener } from '@/lib/collections'
import {
  fertilizerApplicationMethods,
  fertilizerConfidenceOptions,
  fertilizerMicronutrients,
  fertilizerPrimaryNutrients,
  fertilizerProductTypes,
  fertilizerSecondaryNutrients,
  guaranteedAnalysisSummary,
  labelizeFertilizerValue,
  manufacturerFeedRateLabel,
  npkLabel,
  recipeNpkLabel,
} from '@/lib/fertilizers'
import { prisma } from '@/lib/prisma'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-2 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

function ProductSelectRows({ products, rows = [] }: { products: any[]; rows?: any[] }) {
  const filled = [...rows]
  while (filled.length < 3) filled.push({})
  return (
    <div className="grid gap-2 md:col-span-2">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Products in recipe</p>
      {filled.map((row, index) => (
        <div key={row.id || index} className="grid gap-2 rounded-md border border-stone-200 bg-white/60 p-2 sm:grid-cols-[minmax(12rem,1fr)_7rem_7rem_minmax(10rem,1fr)]">
          <select name="recipeProductId" className={selectClass} defaultValue={row.productId || ''}>
            <option value="">No product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}{product.brand ? ` · ${product.brand}` : ''}{npkLabel(product) ? ` · ${npkLabel(product)}` : ''}{manufacturerFeedRateLabel(product) ? ` · label: ${manufacturerFeedRateLabel(product)}` : ''}
              </option>
            ))}
          </select>
          <Field label="Amount" name="recipeProductAmount" defaultValue={row.amount || ''} />
          <Field label="Unit" name="recipeProductUnit" defaultValue={row.unit || ''} />
          <Field label="Notes" name="recipeProductNotes" defaultValue={row.notes || ''} />
        </div>
      ))}
    </div>
  )
}

function NutrientField({ field, label, product }: { field: string; label: string; product?: any }) {
  return (
    <Field
      label={label}
      name={field}
      type="number"
      step="0.0001"
      min="0"
      max="100"
      defaultValue={product?.[field] != null ? String(product[field]) : ''}
      placeholder="%"
    />
  )
}

function ProductForm({ collectionSlug, product }: { collectionSlug: string; product?: any }) {
  const action = product ? updateFertilizerProduct : createFertilizerProduct
  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      {product && <input type="hidden" name="fertilizerProductId" value={product.id} />}
      <input type="hidden" name="aiModel" defaultValue={product?.aiModel || ''} />
      <input type="hidden" name="aiFilledAt" defaultValue={product?.aiFilledAt ? product.aiFilledAt.toISOString() : ''} />

      <section className="grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 md:col-span-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <h4 className="font-serif text-lg font-semibold">Basic product information</h4>
          <FertilizerProductMagicFillButton className="mt-2" />
        </div>
        <Field label="Name" name="name" defaultValue={product?.name || ''} required />
        <Field label="Brand / manufacturer" name="brand" defaultValue={product?.brand || ''} />
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          Product type
          <select name="productType" className={selectClass} defaultValue={product?.productType || 'OTHER'}>
            {fertilizerProductTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>

      <section className="grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 md:col-span-3 md:grid-cols-3">
        <h4 className="font-serif text-lg font-semibold md:col-span-3">Primary nutrients</h4>
        {fertilizerPrimaryNutrients.map(([field, label]) => <NutrientField key={field} field={field} label={label} product={product} />)}
      </section>

      <section className="grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 md:col-span-3 md:grid-cols-3">
        <h4 className="font-serif text-lg font-semibold md:col-span-3">Secondary nutrients</h4>
        {fertilizerSecondaryNutrients.map(([field, label]) => <NutrientField key={field} field={field} label={label} product={product} />)}
      </section>

      <details className="group rounded-lg border border-stone-200 bg-white/50 md:col-span-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
          <span>Micronutrients</span>
          <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:hidden">Open</span>
          <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:inline-block">Hide</span>
        </summary>
        <div className="grid gap-3 border-t border-stone-200 p-3 md:grid-cols-3">
          {fertilizerMicronutrients.map(([field, label]) => <NutrientField key={field} field={field} label={label} product={product} />)}
        </div>
      </details>

      <section className="grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 md:col-span-3 md:grid-cols-4">
        <h4 className="font-serif text-lg font-semibold md:col-span-4">Manufacturer feed rate</h4>
        <Field label="Feed amount" name="manufacturerFeedAmount" defaultValue={product?.manufacturerFeedAmount || ''} placeholder="e.g. 1" />
        <Field label="Feed unit" name="manufacturerFeedUnit" defaultValue={product?.manufacturerFeedUnit || ''} placeholder="tsp, mL" />
        <Field label="Water volume" name="manufacturerFeedWaterVolume" defaultValue={product?.manufacturerFeedWaterVolume || ''} placeholder="e.g. 1" />
        <Field label="Water unit" name="manufacturerFeedWaterUnit" defaultValue={product?.manufacturerFeedWaterUnit || ''} placeholder="gallon, liter" />
        <Field label="Manufacturer recommended dilution" name="manufacturerRecommendedDilution" defaultValue={product?.defaultDilution || ''} wrapperClassName="md:col-span-2" />
        <Field label="Feed notes" name="manufacturerFeedNotes" defaultValue={product?.manufacturerFeedNotes || ''} wrapperClassName="md:col-span-2" />
      </section>

      <section className="grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 md:col-span-3 md:grid-cols-2">
        <h4 className="font-serif text-lg font-semibold md:col-span-2">Usage and source notes</h4>
        <TextArea label="Guaranteed analysis notes" name="guaranteedAnalysisNotes" defaultValue={product?.guaranteedAnalysisNotes || ''} className="min-h-16" />
        <TextArea label="Usage notes" name="usageNotes" defaultValue={product?.concentrationNotes || ''} className="min-h-16" />
        <Field label="Source name" name="sourceName" defaultValue={product?.sourceName || ''} />
        <Field label="Source URL" name="sourceUrl" type="url" defaultValue={product?.sourceUrl || ''} />
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          Confidence
          <select name="dataConfidence" className={selectClass} defaultValue={product?.dataConfidence || 'USER_ENTERED'}>
            {fertilizerConfidenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <TextArea label="General notes" name="notes" defaultValue={product?.notes || ''} className="min-h-16" />
      </section>

      <label className="inline-flex items-center gap-2 text-sm font-medium md:col-span-3">
        <input type="hidden" name="active" value="off" />
        <input type="checkbox" name="active" defaultChecked={product ? product.active : true} />
        Active
      </label>
      <Button className="w-fit md:col-span-3">{product ? 'Save product' : 'Create product'}</Button>
    </form>
  )
}

function RecipeForm({ collectionSlug, products, recipe }: { collectionSlug: string; products: any[]; recipe?: any }) {
  const action = recipe ? updateFertilizerRecipe : createFertilizerRecipe
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      {recipe && <input type="hidden" name="fertilizerRecipeId" value={recipe.id} />}
      <Field label="Recipe name" name="name" defaultValue={recipe?.name || ''} required />
      <Field label="Declared/final NPK" name="declaredNpk" defaultValue={recipe?.declaredNpk || ''} placeholder="e.g. 7-9-5" />
      <TextArea label="Description" name="description" defaultValue={recipe?.description || ''} wrapperClassName="md:col-span-2" className="min-h-16" />
      <label className="grid gap-1 text-sm font-medium text-stone-800">
        Application method
        <select name="applicationMethod" className={selectClass} defaultValue={recipe?.applicationMethod || 'ROOT_DRENCH'}>
          {fertilizerApplicationMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <Field label="Strength label" name="strengthLabel" defaultValue={recipe?.strengthLabel || ''} placeholder="e.g. quarter strength" />
      <Field label="Dilution instructions" name="dilutionInstructions" defaultValue={recipe?.dilutionInstructions || ''} />
      <Field label="Frequency days" name="frequencyDays" type="number" min="1" max="365" defaultValue={recipe?.frequencyDays || ''} />
      <Field label="Dose amount" name="doseAmount" defaultValue={recipe?.doseAmount || ''} />
      <Field label="Dose unit" name="doseUnit" defaultValue={recipe?.doseUnit || ''} />
      <Field label="Water volume" name="waterVolume" defaultValue={recipe?.waterVolume || ''} />
      <Field label="Water volume unit" name="waterVolumeUnit" defaultValue={recipe?.waterVolumeUnit || ''} />
      <Field label="Frequency notes" name="frequencyNotes" defaultValue={recipe?.frequencyNotes || ''} />
      <Field label="Seasonal notes" name="seasonalNotes" defaultValue={recipe?.seasonalNotes || ''} />
      <TextArea label="Safety / caution notes" name="safetyNotes" defaultValue={recipe?.safetyNotes || ''} className="min-h-16" />
      <TextArea label="Recipe notes" name="notes" defaultValue={recipe?.notes || ''} className="min-h-16" />
      <ProductSelectRows products={products.filter((product) => product.active)} rows={recipe?.products || []} />
      <div className="flex flex-wrap gap-4 text-sm font-medium md:col-span-2">
        <label className="inline-flex items-center gap-2"><input type="hidden" name="active" value="off" /><input type="checkbox" name="active" defaultChecked={recipe ? recipe.active : true} /> Active</label>
        <label className="inline-flex items-center gap-2"><input type="hidden" name="draft" value="off" /><input type="checkbox" name="draft" defaultChecked={Boolean(recipe?.draft)} /> Draft</label>
      </div>
      <Button className="w-fit md:col-span-2">{recipe ? 'Save recipe' : 'Create recipe'}</Button>
    </form>
  )
}

export default async function FertilizersPage() {
  const context = await requireCollectionGardener()
  const [products, recipes] = await Promise.all([
    prisma.fertilizerProduct.findMany({ where: { collectionId: context.collection.id }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.fertilizerRecipe.findMany({
      where: { collectionId: context.collection.id },
      include: { products: { include: { product: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ active: 'desc' }, { draft: 'desc' }, { name: 'asc' }],
    }),
  ])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Fertilizers</h2>
          <p className="text-sm text-stone-600">Manage collection-scoped fertilizer products and recipes used by husbandry guides and care tasks.</p>
        </div>
        <Link href={collectionPath(context.collection.slug, '/care')} className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold">
          Care Queue
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <Card>
            <h3 className="font-serif text-2xl font-semibold">Add product</h3>
            <div className="mt-3">
              <ProductForm collectionSlug={context.collection.slug} />
            </div>
          </Card>

          <Card>
            <h3 className="font-serif text-2xl font-semibold">Products</h3>
            <div className="mt-3 grid gap-2">
              {products.length === 0 && <p className="text-sm text-stone-600">No fertilizer products yet.</p>}
              {products.map((product) => (
                <details key={product.id} className="group rounded-lg border border-stone-200 bg-white/55">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3">
                    <span>
                      <span className="block font-semibold">{product.name}</span>
                      <span className="block text-xs text-stone-600">{[product.brand, labelizeFertilizerValue(product.productType), npkLabel(product), product.dataConfidence?.toLowerCase().replaceAll('_', ' '), product.active ? 'active' : 'archived'].filter(Boolean).join(' · ')}</span>
                      {guaranteedAnalysisSummary(product) && <span className="mt-1 block text-xs text-stone-500">{guaranteedAnalysisSummary(product)}</span>}
                      {manufacturerFeedRateLabel(product) && <span className="mt-1 block text-xs text-stone-500">Label rate: {manufacturerFeedRateLabel(product)}</span>}
                    </span>
                    <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:hidden">Edit</span>
                    <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:inline-block">Close</span>
                  </summary>
                  <div className="border-t border-stone-200 p-3">
                    {(product.sourceName || product.sourceUrl || product.dataReviewedAt) && (
                      <div className="mb-3 rounded-md border border-[#d6dfc9] bg-[#f7f4e8]/75 p-2 text-xs text-stone-700">
                        {product.sourceName && <p><strong>Source:</strong> {product.sourceName}</p>}
                        {product.sourceUrl && <p><strong>URL:</strong> <a className="text-[#2f6b45] underline" href={product.sourceUrl}>{product.sourceUrl}</a></p>}
                        {product.dataReviewedAt && <p><strong>Reviewed:</strong> {product.dataReviewedAt.toLocaleString()}</p>}
                      </div>
                    )}
                    <ProductForm collectionSlug={context.collection.slug} product={product} />
                    <div className="mt-3 flex flex-wrap gap-3 border-t border-stone-200 pt-3">
                      {product.dataConfidence !== 'VERIFIED' && (
                        <form action={markFertilizerProductReviewed}>
                          <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                          <input type="hidden" name="fertilizerProductId" value={product.id} />
                          <button className="text-sm font-semibold text-[#2f6b45] underline">Mark reviewed</button>
                        </form>
                      )}
                      <form action={archiveFertilizerProduct}>
                        <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                        <input type="hidden" name="fertilizerProductId" value={product.id} />
                        {!product.active && <input type="hidden" name="active" value="on" />}
                        <button className="text-sm font-semibold text-[#2f6b45] underline">{product.active ? 'Archive product' : 'Restore product'}</button>
                      </form>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="font-serif text-2xl font-semibold">Add recipe</h3>
            <div className="mt-3">
              <RecipeForm collectionSlug={context.collection.slug} products={products} />
            </div>
          </Card>

          <Card>
            <h3 className="font-serif text-2xl font-semibold">Recipes</h3>
            <div className="mt-3 grid gap-2">
              {recipes.length === 0 && <p className="text-sm text-stone-600">No fertilizer recipes yet.</p>}
              {recipes.map((recipe) => (
                <details key={recipe.id} className="group rounded-lg border border-stone-200 bg-white/55">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3">
                    <span>
                      <span className="block font-semibold">{recipe.name}</span>
                      <span className="block text-xs text-stone-600">{[recipeNpkLabel(recipe), labelizeFertilizerValue(recipe.applicationMethod), recipe.frequencyDays ? `every ${recipe.frequencyDays}d` : recipe.frequencyNotes, recipe.draft ? 'draft' : null, recipe.active ? 'active' : 'archived'].filter(Boolean).join(' · ')}</span>
                      {recipe.products.length > 0 && <span className="mt-1 block text-xs text-stone-500">{recipe.products.map((row) => row.product.name).join(', ')}</span>}
                      {recipe.products.some((row) => manufacturerFeedRateLabel(row.product)) && (
                        <span className="mt-1 block text-xs text-stone-500">
                          Label rates: {recipe.products.map((row) => manufacturerFeedRateLabel(row.product) ? `${row.product.name}: ${manufacturerFeedRateLabel(row.product)}` : null).filter(Boolean).join('; ')}
                        </span>
                      )}
                    </span>
                    <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:hidden">Edit</span>
                    <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:inline-block">Close</span>
                  </summary>
                  <div className="border-t border-stone-200 p-3">
                    <RecipeForm collectionSlug={context.collection.slug} products={products} recipe={recipe} />
                    <form action={archiveFertilizerRecipe} className="mt-3 border-t border-stone-200 pt-3">
                      <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                      <input type="hidden" name="fertilizerRecipeId" value={recipe.id} />
                      {!recipe.active && <input type="hidden" name="active" value="on" />}
                      <button className="text-sm font-semibold text-[#2f6b45] underline">{recipe.active ? 'Archive recipe' : 'Restore recipe'}</button>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
