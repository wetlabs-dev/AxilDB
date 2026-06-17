import Link from 'next/link'
import { createWorkflowTemplate, startWorkflowRun } from '@/app/workflow-actions'
import { Button, Card, Field, LinkButton, Select, TextArea } from '@/components/ui'
import { canCreateInCollection, canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { ensureStarterWorkflowTemplates, workflowProgress, workflowRunStatusLabel, workflowScopeLabel } from '@/lib/workflows'
import { plantName } from '@/lib/utils'

function statusClass(status: string) {
  if (status === 'ACTIVE') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (status === 'COMPLETED') return 'border-green-200 bg-green-50 text-green-900'
  if (status === 'CANCELLED') return 'border-stone-300 bg-stone-100 text-stone-700'
  return 'border-stone-200 bg-stone-50 text-stone-700'
}

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const context = await requireCollectionViewer()
  const sp = await searchParams
  const { collection, user } = context
  const canManage = canManageCollection(user, context)
  const canStart = canCreateInCollection(user, context)
  await ensureStarterWorkflowTemplates(prisma, collection.id)

  const [templates, activeRuns, completedRuns, locations, plants, members] = await Promise.all([
    prisma.workflowTemplate.findMany({
      where: { collectionId: collection.id, isArchived: false },
      include: { _count: { select: { steps: true, runs: true } } },
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
    }),
    prisma.workflowRun.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      include: { template: true, location: true, plants: { include: { plantInstance: { include: { plantDefinition: true } } } }, steps: true, assignedTo: { select: { email: true } } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.workflowRun.findMany({
      where: { collectionId: collection.id, status: { in: ['COMPLETED', 'CANCELLED'] } },
      include: { template: true, location: true, plants: true, steps: true },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    }),
    prisma.location.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, include: { locationType: true }, orderBy: [{ code: 'asc' }] }),
    prisma.plantInstance.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, include: { plantDefinition: true, currentLocation: true }, orderBy: { plantId: 'asc' }, take: 500 }),
    prisma.collectionMembership.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, include: { user: { select: { id: true, email: true } } }, orderBy: { role: 'asc' } }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Greenhouse Workflows</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-600">
            Build repeatable operating procedures from typed steps, start manual runs for a collection, location, or selected plants, and let completed steps write real AxilDB records.
          </p>
        </div>
        <LinkButton href={collectionPath(collection.slug, '/care')}>Care Queue</LinkButton>
      </div>

      {sp.run === 'completed' && <Card className="border-green-200 bg-green-50 text-sm text-green-900">Workflow run completed.</Card>}
      {sp.run === 'cancelled' && <Card className="border-stone-300 bg-stone-100 text-sm text-stone-800">Workflow run cancelled.</Card>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-xl font-semibold">Workflow Templates</h3>
              <p className="mt-1 text-sm text-stone-600">Starter templates are installed here and can be copied into editable collection-local templates.</p>
            </div>
            {canManage && (
              <details className="rounded-md border border-stone-200 bg-white/60 p-2 text-sm">
                <summary className="cursor-pointer font-semibold">Create template</summary>
                <form action={createWorkflowTemplate} className="mt-3 grid gap-2">
                  <input type="hidden" name="collectionSlug" value={collection.slug} />
                  <Field label="Name" name="name" required />
                  <Field label="Category" name="category" />
                  <TextArea label="Description" name="description" />
                  <Field label="Future trigger type" name="triggerType" placeholder="Optional placeholder, e.g. RECURRING" />
                  <TextArea label="Future trigger config notes" name="triggerConfigJson" />
                  <Button>Create template</Button>
                </form>
              </details>
            )}
          </div>
          <div className="mt-4 grid gap-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-stone-200 bg-white/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#2f6b45]">{template.category || 'Workflow'}{template.isBuiltIn ? ' · Starter' : ''}</p>
                    <Link href={collectionPath(collection.slug, `/workflows/templates/${template.id}`)} className="font-serif text-xl font-semibold underline">{template.name}</Link>
                    {template.description && <p className="mt-1 text-sm text-stone-600">{template.description}</p>}
                    <p className="mt-2 text-xs text-stone-500">{template._count.steps} step{template._count.steps === 1 ? '' : 's'} · {template._count.runs} run{template._count.runs === 1 ? '' : 's'}</p>
                  </div>
                  <LinkButton href={collectionPath(collection.slug, `/workflows/templates/${template.id}`)} className="px-3 py-1.5">Open</LinkButton>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-serif text-xl font-semibold">Start Workflow</h3>
          <p className="mt-1 text-sm text-stone-600">Runs are manual in v1. Scope them to a collection, one location, or selected plants.</p>
          {canStart ? (
            <form action={startWorkflowRun} className="mt-4 grid gap-3">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <Select label="Template" name="templateId">
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </Select>
              <Field label="Run title" name="title" placeholder="Optional custom title" />
              <Select label="Scope" name="scopeType" defaultValue="COLLECTION">
                <option value="COLLECTION">Collection</option>
                <option value="LOCATION">Location</option>
                <option value="PLANTS">Selected plants</option>
              </Select>
              <Select label="Location scope / destination option" name="locationId" defaultValue="">
                <option value="">No location scope</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
              </Select>
              <label className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white/60 p-2 text-sm">
                <input type="hidden" name="includeNestedLocations" value="0" />
                <input type="checkbox" name="includeNestedLocations" value="1" defaultChecked />
                Include child locations
              </label>
              <Select label="Assign whole run" name="assignedToUserId" defaultValue="">
                <option value="">Unassigned</option>
                {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.email} · {member.role.toLowerCase()}</option>)}
              </Select>
              <fieldset className="rounded-md border border-stone-200 bg-white/50 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Selected plants</legend>
                <div className="mt-2 grid max-h-72 gap-2 overflow-auto sm:grid-cols-2">
                  {plants.map((plant) => (
                    <label key={plant.id} className="flex items-start gap-2 rounded border border-stone-200 bg-white/70 p-2 text-sm">
                      <input type="checkbox" name="plantInstanceId" value={plant.id} />
                      <span>
                        <span className="block font-mono text-xs font-semibold text-[#2f6b45]">{plant.plantId}</span>
                        <span className="block">{plantName(plant.plantDefinition)}</span>
                        <span className="block text-xs text-stone-500">{plant.currentLocation ? `${plant.currentLocation.code} · ${plant.currentLocation.name}` : 'No location'}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button>Start workflow</Button>
            </form>
          ) : (
            <p className="mt-4 rounded-md border border-stone-200 bg-white/60 p-3 text-sm text-stone-600">Viewer access can inspect workflow history, but cannot start runs.</p>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Active Runs</h3>
        <div className="mt-4 grid gap-3">
          {activeRuns.length === 0 && <p className="text-sm text-stone-600">No active workflow runs.</p>}
          {activeRuns.map((run) => {
            const progress = workflowProgress(run)
            return (
              <Link key={run.id} href={collectionPath(collection.slug, `/workflows/runs/${run.id}`)} className="rounded-lg border border-stone-200 bg-white/60 p-3 transition hover:border-[#8fa58f]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-serif text-xl font-semibold">{run.title}</p>
                    <p className="text-sm text-stone-600">
                      {workflowScopeLabel(run.scopeType)} · {run.location ? `${run.location.code} ${run.location.name}` : `${run.plants.length} selected plant${run.plants.length === 1 ? '' : 's'}`} · assigned to {run.assignedTo?.email || 'no one'}
                    </p>
                    {run.plants.length > 0 && <p className="mt-1 text-xs text-stone-500">{run.plants.slice(0, 4).map((entry) => entry.plantInstance.plantId).join(', ')}{run.plants.length > 4 ? '…' : ''}</p>}
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(run.status)}`}>{progress.completed}/{progress.total} steps</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full bg-[#2f6b45]" style={{ width: `${progress.percent}%` }} />
                </div>
              </Link>
            )
          })}
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Completed Runs</h3>
        <div className="mt-4 grid gap-2">
          {completedRuns.length === 0 && <p className="text-sm text-stone-600">No completed or cancelled runs yet.</p>}
          {completedRuns.map((run) => (
            <Link key={run.id} href={collectionPath(collection.slug, `/workflows/runs/${run.id}`)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/60 p-3 text-sm underline">
              <span>{run.title} · {workflowScopeLabel(run.scopeType)} · {run.steps.filter((step) => step.status !== 'PENDING').length}/{run.steps.length} steps</span>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold no-underline ${statusClass(run.status)}`}>{workflowRunStatusLabel(run.status)}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
