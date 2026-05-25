import Link from 'next/link'
import { CheckCircle2, Leaf, Printer, SkipForward } from 'lucide-react'
import { completeCareSheetTask, skipCareSheetTask } from '@/app/actions'
import { PlantImage } from '@/components/PlantImage'
import { Button, Card, TextArea } from '@/components/ui'
import {
  careSheetModeLabel,
  instanceDisplayName,
  instanceImage,
  sectionValuesForInstance,
} from '@/lib/care-sheets'
import { careTaskLabel } from '@/lib/care-queue'
import { collectionPath } from '@/lib/collections'

function formatDate(date?: Date | string | null) {
  if (!date) return 'No date'
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function sheetSections(sheet: any) {
  return Array.isArray(sheet.sections) ? sheet.sections : []
}

function plantPath(collectionSlug: string | null | undefined, plantId: string) {
  return collectionSlug ? collectionPath(collectionSlug, `/instances/${plantId}`) : '#'
}

export function CareSheetView({
  sheet,
  token,
  publicMode = false,
}: {
  sheet: any
  token?: string
  publicMode?: boolean
}) {
  const selectedSections = sheetSections(sheet)
  const tasksByPlant = new Map<string, any[]>()
  for (const task of sheet.tasks || []) {
    if (!task.plantInstanceId) continue
    const current = tasksByPlant.get(task.plantInstanceId) || []
    current.push(task)
    tasksByPlant.set(task.plantInstanceId, current)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2f6b45]">{careSheetModeLabel(sheet.mode)}</p>
          <h2 className="text-3xl font-bold">{sheet.title}</h2>
          <p className="text-sm text-stone-600">
            {sheet.collection?.name}
            {sheet.startsAt ? ` · starts ${formatDate(sheet.startsAt)}` : ''}
            {sheet.expiresAt ? ` · expires ${formatDate(sheet.expiresAt)}` : ''}
          </p>
        </div>
        {!publicMode && (
          <Link
            href={`/api/care-sheets/${sheet.id}/pdf`}
            className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-medium text-stone-800"
          >
            <Printer className="h-4 w-4" /> PDF
          </Link>
        )}
      </div>

      {sheet.settings?.customInstructions && (
        <Card className="border-[#b9c8aa] bg-[#f5f8ed]">
          <h3 className="font-serif text-xl font-bold">Instructions</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{sheet.settings.customInstructions}</p>
          {sheet.settings.emergencyContact && <p className="mt-3 text-sm font-medium text-stone-700">Emergency/contact: {sheet.settings.emergencyContact}</p>}
        </Card>
      )}

      <div className="grid gap-4">
        {sheet.plants?.map((entry: any) => {
          const instance = entry.plantInstance
          const image = instanceImage(instance)
          const sections = sectionValuesForInstance(instance, selectedSections)
          const tasks = tasksByPlant.get(instance.id) || []
          return (
            <Card key={entry.id} className="grid gap-4 lg:grid-cols-[14rem_1fr]">
              <div className="space-y-3">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-[#d6dfc9]/40">
                  <PlantImage src={image} alt={instance.plantId} />
                </div>
                <div>
                  <h3 className="font-serif text-2xl font-bold leading-tight">{instance.plantId}</h3>
                  <p className="text-sm text-stone-700">{instanceDisplayName(instance)}</p>
                  {instance.location && <p className="text-xs text-stone-500">{instance.location}</p>}
                  {!publicMode && (
                    <Link href={plantPath(sheet.collection?.slug, instance.id)} className="mt-2 inline-block text-sm font-medium text-[#2f6b45] underline">
                      View record
                    </Link>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                {entry.notes && <p className="rounded-md border border-stone-200 bg-white/50 p-3 text-sm text-stone-700">{entry.notes}</p>}

                {tasks.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-serif text-lg font-bold">Tasks</h4>
                    <div className="grid gap-2">
                      {tasks.map((task) => (
                        <div key={task.id} className="rounded-md border border-stone-200 bg-white/65 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs font-bold uppercase tracking-[0.14em]">
                              {careTaskLabel(task.taskType)}
                            </span>
                            <span className="text-sm text-stone-600">{formatDate(task.dueAt)}</span>
                            <span className={task.status === 'COMPLETED' ? 'text-sm font-medium text-[#2f6b45]' : 'text-sm text-stone-600'}>{task.status.toLowerCase()}</span>
                          </div>
                          <p className="mt-1 font-medium text-stone-900">{task.title}</p>
                          {task.reason && <p className="text-sm text-stone-700">{task.reason}</p>}
                          {publicMode && token && task.status === 'PENDING' && sheet.settings?.allowTaskCompletion !== false && (
                            <div className="mt-3 grid gap-2 border-t border-stone-200 pt-3">
                              <form action={completeCareSheetTask} className="grid gap-2">
                                <input type="hidden" name="token" value={token} />
                                <input type="hidden" name="taskId" value={task.id} />
                                <input type="hidden" name="back" value={sheet.mode === 'SITTER_SESSION' ? `/sitter/${token}` : `/care-sheet/${token}`} />
                                <input className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" name="completedByName" placeholder="Your name (optional)" />
                                {sheet.settings?.allowNotes !== false && <TextArea label="Note" name="notes" className="min-h-14" />}
                                <Button className="inline-flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4" /> Complete</Button>
                              </form>
                              <form action={skipCareSheetTask} className="flex flex-wrap items-end gap-2">
                                <input type="hidden" name="token" value={token} />
                                <input type="hidden" name="taskId" value={task.id} />
                                <input type="hidden" name="back" value={sheet.mode === 'SITTER_SESSION' ? `/sitter/${token}` : `/care-sheet/${token}`} />
                                <input className="min-w-0 flex-1 rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" name="notes" placeholder="Skip reason" />
                                <button className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-medium">
                                  <SkipForward className="h-4 w-4" /> Skip
                                </button>
                              </form>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sections.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {sections.map((section) => (
                      <div key={section.key} className="rounded-md border border-stone-200 bg-white/55 p-3">
                        <h4 className="font-serif text-lg font-bold">{section.title}</h4>
                        <dl className="mt-2 grid gap-2 text-sm">
                          {section.fields.map((field: any) => (
                            <div key={field.name}>
                              <dt className="font-semibold text-stone-800">
                                {field.label}
                                {field.overridden && <span className="ml-2 rounded-full bg-[#d6dfc9] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-[#1f472f]">Local adjustment</span>}
                              </dt>
                              <dd className="text-stone-700">{field.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-600">
                    <Leaf className="mb-2 h-5 w-5 text-[#2f6b45]" />
                    No husbandry fields are filled for the selected sections yet.
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
