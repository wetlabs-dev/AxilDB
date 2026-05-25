import { createCareSheet } from '@/app/actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { careSheetSectionOptions } from '@/lib/care-sheets'
import { requireCollectionLogger } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'

const taskTypes = [
  ['WATER', 'Water'],
  ['PROPAGATION_CHECK', 'Propagation checks'],
  ['PEST_CHECK', 'Pest checks'],
  ['HEALTH_CHECK', 'Health checks'],
  ['BLOOM_CHECK', 'Bloom checks'],
  ['REMINDER', 'Manual reminders'],
] as const

export default async function NewCareSheetPage({ searchParams }: { searchParams: Promise<{ plantInstanceId?: string; mode?: string }> }) {
  const params = await searchParams
  const context = await requireCollectionLogger()
  const plants = await prisma.plantInstance.findMany({
    where: { collectionId: context.collection.id, status: 'ACTIVE' },
    include: { plantDefinition: true },
    orderBy: [{ location: 'asc' }, { plantId: 'asc' }],
  })
  const defaultMode = params.mode === 'sitter' ? 'SITTER_SESSION' : params.mode === 'checklist' ? 'WEEKLY_CHECKLIST' : 'CARE_SHEET'
  const defaultPlant = params.plantInstanceId

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-bold">New Care Sheet</h2>
        <p className="text-sm text-stone-600">Choose plants, sections, and whether this is a printed guide, weekly checklist, or sitter plan.</p>
      </div>

      <form action={createCareSheet} className="space-y-4">
        <input type="hidden" name="collectionSlug" value={context.collection.slug} />
        <Card className="grid gap-4 lg:grid-cols-4">
          <Field label="Title" name="title" wrapperClassName="lg:col-span-2" defaultValue={defaultMode === 'WEEKLY_CHECKLIST' ? 'Weekly greenhouse checklist' : defaultMode === 'SITTER_SESSION' ? 'Plant sitter plan' : 'Care sheet'} />
          <Select label="Mode" name="mode" defaultValue={defaultMode}>
            <option value="CARE_SHEET">Care sheet</option>
            <option value="WEEKLY_CHECKLIST">Weekly checklist</option>
            <option value="SITTER_SESSION">Plant sitter plan</option>
          </Select>
          <label className="flex items-end gap-2 text-sm font-medium text-stone-800">
            <input type="checkbox" name="shareable" className="h-4 w-4" defaultChecked={defaultMode === 'SITTER_SESSION'} />
            Create share link
          </label>
          <Field label="Starts" name="startsAt" type="date" />
          <Field label="Expires" name="expiresAt" type="date" />
          <TextArea label="Custom instructions" name="customInstructions" wrapperClassName="lg:col-span-2" />
          <Field label="Emergency/contact note" name="emergencyContact" wrapperClassName="lg:col-span-2" />
        </Card>

        <Card>
          <h3 className="font-serif text-xl font-bold">Plants</h3>
          <p className="text-sm text-stone-600">Select the specimens to include.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plants.map((plant) => (
              <label key={plant.id} className="flex gap-2 rounded-md border border-stone-200 bg-white/60 p-3 text-sm">
                <input type="checkbox" name="plantInstanceId" value={plant.id} defaultChecked={defaultPlant === plant.id} className="mt-1 h-4 w-4" />
                <span>
                  <b className="block">{plant.plantId}</b>
                  <span className="text-stone-700">{plantName(plant.plantDefinition)}</span>
                  {plant.location && <span className="block text-xs text-stone-500">{plant.location}</span>}
                </span>
              </label>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="font-serif text-xl font-bold">Husbandry sections</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {careSheetSectionOptions.map((section) => (
                <label key={section.key} className="flex gap-2 text-sm">
                  <input type="checkbox" name="section" value={section.key} defaultChecked className="mt-1 h-4 w-4" />
                  {section.title}
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-serif text-xl font-bold">Checklist and sitter tasks</h3>
            <p className="text-sm text-stone-600">For checklist/sitter modes, snapshot due and upcoming tasks of these types.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {taskTypes.map(([value, label]) => (
                <label key={value} className="flex gap-2 text-sm">
                  <input type="checkbox" name="taskType" value={value} defaultChecked className="mt-1 h-4 w-4" />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-4 text-sm">
              <label className="flex gap-2"><input type="checkbox" name="allowTaskCompletion" defaultChecked /> Allow task completion</label>
              <label className="flex gap-2"><input type="checkbox" name="allowNotes" defaultChecked /> Allow notes</label>
            </div>
          </Card>
        </div>

        <Button>Create care sheet</Button>
      </form>
    </div>
  )
}
