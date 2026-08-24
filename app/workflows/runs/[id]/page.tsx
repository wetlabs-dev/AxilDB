import Link from 'next/link'
import { cancelWorkflowRun, completeWorkflowRun, completeWorkflowRunStep, skipWorkflowRunStep } from '@/app/workflow-actions'
import { Button, Card, DangerButton, Field, LinkButton, Select, TextArea } from '@/components/ui'
import { canCreateInCollection, canEditInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { workflowProgress, workflowScopeLabel, workflowStepLabel } from '@/lib/workflows'
import { plantName } from '@/lib/utils'

function stepStatusClass(status: string) {
  if (status === 'COMPLETED') return 'border-green-200 bg-green-50 text-green-900'
  if (status === 'SKIPPED') return 'border-stone-300 bg-stone-100 text-stone-700'
  if (status === 'COMPLETING') return 'border-blue-200 bg-blue-50 text-blue-900'
  return 'border-amber-200 bg-amber-50 text-amber-900'
}

function needsPlants(stepType: string) {
  return ['WATER', 'FERTILIZE', 'PEST_CHECK', 'HEALTH_CHECK', 'RELOCATE', 'START_QUARANTINE', 'RELEASE_QUARANTINE', 'CREATE_REMINDER', 'PROPAGATION_CHECK', 'BLOOM_CHECK', 'CREATE_CARE_EVENT', 'ADD_PHOTO'].includes(stepType)
}

export default async function WorkflowRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ workflow?: string }> }) {
  const context = await requireCollectionViewer()
  const { id } = await params
  const sp = await searchParams
  const { collection, user } = context
  const canComplete = canCreateInCollection(user, context)
  const canManageRun = canEditInCollection(user, context)
  const [run, locations] = await Promise.all([
    prisma.workflowRun.findFirstOrThrow({
      where: { id, collectionId: collection.id },
      include: {
        template: true,
        location: true,
        assignedTo: { select: { email: true } },
        startedBy: { select: { email: true } },
        plants: { include: { plantInstance: { include: { plantDefinition: true, currentLocation: true } } }, orderBy: { plantInstance: { plantId: 'asc' } } },
        steps: { orderBy: { sortOrder: 'asc' }, include: { completedByUser: { select: { email: true } } } },
      },
    }),
    prisma.location.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, orderBy: { code: 'asc' } }),
  ])
  const progress = workflowProgress(run)
  const readOnly = run.status !== 'ACTIVE'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2f6b45]">{run.template?.name || 'Workflow run'} · {workflowScopeLabel(run.scopeType)}</p>
          <h2 className="text-3xl font-bold">{run.title}</h2>
          <p className="mt-1 text-sm text-stone-600">
            Started by {run.startedBy.email} · assigned to {run.assignedTo?.email || 'no one'} · {run.location ? `${run.location.code} ${run.location.name}` : `${run.plants.length} selected plant${run.plants.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <LinkButton href={collectionPath(collection.slug, '/workflows')}>All workflows</LinkButton>
      </div>

      {sp.workflow === 'required-pending' && <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">Complete or skip required steps before completing this run.</Card>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Run Progress</h3>
            <p className="mt-1 text-sm text-stone-600">{progress.completed}/{progress.total} steps handled · status {run.status.toLowerCase()}</p>
          </div>
          <span className="rounded-full border border-[#8fa58f]/40 bg-[#e8efdf] px-3 py-1 text-sm font-semibold text-[#2f6b45]">{progress.percent}%</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full bg-[#2f6b45]" style={{ width: `${progress.percent}%` }} />
        </div>
        {run.plants.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {run.plants.map((entry) => (
              <Link key={entry.id} href={collectionPath(collection.slug, `/instances/${entry.plantInstanceId}`)} className="rounded-md border border-stone-200 bg-white/60 p-2 text-sm underline">
                <span className="font-mono text-xs font-semibold text-[#2f6b45]">{entry.plantInstance.plantId}</span>
                <span className="block">{plantName(entry.plantInstance.plantDefinition)}</span>
                <span className="block text-xs text-stone-500">{entry.plantInstance.currentLocation ? `${entry.plantInstance.currentLocation.code} · ${entry.plantInstance.currentLocation.name}` : 'No location'}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4">
        {run.steps.map((step, index) => (
          <Card key={step.id} className={step.status === 'PENDING' ? '' : 'bg-white/60'}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Step {index + 1} · {workflowStepLabel(step.stepType)} · {step.required ? 'required' : 'optional'}</p>
                <h3 className="mt-1 font-serif text-xl font-semibold">{step.title}</h3>
                {step.instructions && <p className="mt-1 text-sm text-stone-600">{step.instructions}</p>}
                {step.completedAt && <p className="mt-2 text-xs text-stone-500">Handled by {step.completedByUser?.email || 'unknown'} · {step.completedAt.toLocaleString()}</p>}
                {step.notes && <p className="mt-2 rounded-md border border-stone-200 bg-[#fffaf0] p-2 text-sm text-stone-700">{step.notes}</p>}
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${stepStatusClass(step.status)}`}>{step.status.toLowerCase()}</span>
            </div>
            {canComplete && !readOnly && step.status === 'PENDING' && (
              <div className="mt-4 grid gap-3 rounded-lg border border-stone-200 bg-white/55 p-3">
                {step.stepType === 'ADD_PHOTO' ? (
                  <form action="/api/photos" method="post" encType="multipart/form-data" className="grid gap-3">
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="workflowRunId" value={run.id} />
                    <input type="hidden" name="workflowRunStepId" value={step.id} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/workflows/runs/${run.id}`)} />
                    <div className="grid gap-2">
                      <Select label="Photo target" name="target" defaultValue={run.plants[0] ? `PLANT_INSTANCE:${run.plants[0].plantInstanceId}` : run.location ? `LOCATION:${run.location.id}` : `COLLECTION:${collection.id}`}>
                        {run.plants.map((entry) => (
                          <option key={entry.plantInstanceId} value={`PLANT_INSTANCE:${entry.plantInstanceId}`}>{entry.plantInstance.plantId} · {plantName(entry.plantInstance.plantDefinition)}</option>
                        ))}
                        {run.location && <option value={`LOCATION:${run.location.id}`}>{run.location.code} · {run.location.name}</option>}
                        <option value={`COLLECTION:${collection.id}`}>Collection-level photo</option>
                      </Select>
                    </div>
                    <label className="grid gap-1 text-sm font-medium text-stone-800">
                      Photo
                      <input className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" type="file" name="photo" accept="image/*" required />
                    </label>
                    <TextArea label="Caption / step notes" name="caption" defaultValue={step.instructions || ''} />
                    <Button>Upload photo and complete step</Button>
                  </form>
                ) : (
                <form action={completeWorkflowRunStep} className="grid gap-3">
                  <input type="hidden" name="collectionSlug" value={collection.slug} />
                  <input type="hidden" name="runStepId" value={step.id} />
                  <input type="hidden" name="back" value={collectionPath(collection.slug, `/workflows/runs/${run.id}`)} />
                  {needsPlants(step.stepType) && run.plants.length > 0 && (
                    <fieldset className="rounded-md border border-stone-200 bg-white/60 p-2">
                      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Plants for this step</legend>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        {run.plants.map((entry) => (
                          <label key={entry.plantInstanceId} className="flex gap-2 text-sm">
                            <input type="checkbox" name="plantInstanceId" value={entry.plantInstanceId} defaultChecked />
                            <span>{entry.plantInstance.plantId}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {['WATER', 'FERTILIZE', 'PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK', 'CREATE_CARE_EVENT'].includes(step.stepType) && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Performed date" name="performedAt" type="date" />
                      <Field label="Result" name="result" placeholder="Optional result" />
                      {step.stepType === 'CREATE_CARE_EVENT' && (
                        <Select label="Care event type" name="careEventType" defaultValue="OTHER">
                          <option value="OTHER">Other</option>
                          <option value="WATERED">Watered</option>
                          <option value="FERTILIZED">Fertilized</option>
                          <option value="PEST_CHECK">Pest check</option>
                          <option value="HEALTH_CHECK">Health check</option>
                          <option value="PROPAGATION_CHECK">Propagation check</option>
                          <option value="BLOOM_CHECK">Bloom check</option>
                        </Select>
                      )}
                      {(step.stepType === 'PEST_CHECK' || step.stepType === 'HEALTH_CHECK') && (
                        <>
                          <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="createCondition" /> Create condition record</label>
                          <Select label="Severity" name="severity" defaultValue="MODERATE">
                            <option value="LOW">Low</option>
                            <option value="MODERATE">Moderate</option>
                            <option value="HIGH">High</option>
                            <option value="CRITICAL">Critical</option>
                          </Select>
                        </>
                      )}
                    </div>
                  )}
                  {step.stepType === 'RELOCATE' && (
                    <Select label="Destination location" name="destinationLocationId" defaultValue="">
                      <option value="">No location</option>
                      {locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
                    </Select>
                  )}
                  {step.stepType === 'START_QUARANTINE' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select label="Quarantine location" name="quarantineLocationId" defaultValue="">
                        <option value="">No quarantine location</option>
                        {locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
                      </Select>
                      <Field label="Target release date" name="targetReleaseDate" type="date" />
                      <Field label="Reason" name="reason" placeholder="Workflow quarantine" />
                      <Select label="Risk level" name="riskLevel" defaultValue="UNKNOWN">
                        <option value="UNKNOWN">Unknown</option>
                        <option value="LOW">Low</option>
                        <option value="MODERATE">Moderate</option>
                        <option value="HIGH">High</option>
                      </Select>
                    </div>
                  )}
                  {step.stepType === 'CREATE_REMINDER' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Reminder title" name="reminderTitle" defaultValue={step.title} />
                      <Field label="Due date/time" name="dueAt" type="datetime-local" />
                      <Select label="Category" name="category" defaultValue="GENERAL">
                        <option value="GENERAL">General</option>
                        <option value="PLANT_CHECK_IN">Plant check-in</option>
                        <option value="BLOOM_CYCLE">Bloom cycle</option>
                      </Select>
                      <Field label="Recurrence rule" name="rrule" placeholder="Optional RRULE" />
                    </div>
                  )}
                  {step.stepType === 'DECISION_NOTE' && <Field label="Decision / branch note" name="result" />}
                  <TextArea label="Step notes" name="notes" />
                  <div className="flex flex-wrap gap-2">
                    <Button>Complete step</Button>
                  </div>
                </form>
                )}
                {!step.required && (
                  <form action={skipWorkflowRunStep} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="runStepId" value={step.id} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/workflows/runs/${run.id}`)} />
                    <Field label="Skip note" name="notes" />
                    <Button className="bg-stone-600 hover:bg-stone-700">Skip optional step</Button>
                  </form>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {canManageRun && !readOnly && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Finish Run</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <form action={completeWorkflowRun} className="grid gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="runId" value={run.id} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, `/workflows/runs/${run.id}`)} />
              <TextArea label="Completion summary" name="summary" />
              <Button>Complete workflow run</Button>
            </form>
            <form action={cancelWorkflowRun} className="grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="runId" value={run.id} />
              <TextArea label="Cancellation note" name="summary" />
              <DangerButton>Cancel run</DangerButton>
            </form>
          </div>
        </Card>
      )}
    </div>
  )
}
