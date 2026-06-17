import Link from 'next/link'
import { archiveWorkflowTemplate, copyWorkflowTemplate, addWorkflowStep, deleteWorkflowTemplate, startWorkflowRun, updateWorkflowTemplate } from '@/app/workflow-actions'
import { Button, Card, DangerButton, Field, LinkButton, Select, TextArea } from '@/components/ui'
import { WorkflowStepBuilder } from '@/components/workflows/WorkflowStepBuilder'
import { canCreateInCollection, canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { workflowStepLabel, workflowStepTypes } from '@/lib/workflows'
import { plantName } from '@/lib/utils'

export default async function WorkflowTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireCollectionViewer()
  const { id } = await params
  const { collection, user } = context
  const canManage = canManageCollection(user, context)
  const canStart = canCreateInCollection(user, context)
  const [template, locations, plants, members] = await Promise.all([
    prisma.workflowTemplate.findFirstOrThrow({
      where: { id, collectionId: collection.id },
      include: { steps: { orderBy: { sortOrder: 'asc' } }, _count: { select: { runs: true } } },
    }),
    prisma.location.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, orderBy: { code: 'asc' } }),
    prisma.plantInstance.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, include: { plantDefinition: true, currentLocation: true }, orderBy: { plantId: 'asc' }, take: 500 }),
    prisma.collectionMembership.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, include: { user: { select: { id: true, email: true } } }, orderBy: { role: 'asc' } }),
  ])
  const canEditTemplate = canManage && !template.isBuiltIn

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2f6b45]">{template.category || 'Workflow'}{template.isBuiltIn ? ' · Starter template' : ''}</p>
          <h2 className="text-3xl font-bold">{template.name}</h2>
          {template.description && <p className="mt-1 max-w-3xl text-sm text-stone-600">{template.description}</p>}
          <p className="mt-2 text-xs text-stone-500">{template.steps.length} step{template.steps.length === 1 ? '' : 's'} · {template._count.runs} run{template._count.runs === 1 ? '' : 's'} · triggers stored but disabled</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={collectionPath(collection.slug, '/workflows')}>All workflows</LinkButton>
          {canManage && template.isBuiltIn && (
            <form action={copyWorkflowTemplate}>
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="templateId" value={template.id} />
              <Button type="submit" className="px-3 py-1.5">Copy starter</Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
        <Card>
          <h3 className="font-serif text-xl font-semibold">Template Details</h3>
          {canEditTemplate ? (
            <form action={updateWorkflowTemplate} className="mt-4 grid gap-3">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, `/workflows/templates/${template.id}`)} />
              <Field label="Name" name="name" defaultValue={template.name} required />
              <Field label="Category" name="category" defaultValue={template.category || ''} />
              <TextArea label="Description" name="description" defaultValue={template.description || ''} />
              <Field label="Future trigger type" name="triggerType" defaultValue={template.triggerType || ''} />
              <TextArea label="Future trigger config notes" name="triggerConfigJson" defaultValue={typeof template.triggerConfigJson === 'object' && template.triggerConfigJson && 'note' in template.triggerConfigJson ? String((template.triggerConfigJson as any).note || '') : ''} />
              <div className="flex flex-wrap gap-2">
                <Button>Save template</Button>
              </div>
            </form>
          ) : (
            <p className="mt-3 text-sm text-stone-600">
              {template.isBuiltIn
                ? 'Starter templates stay stable. Copy this starter to create an editable collection template.'
                : 'Only collection managers can edit workflow templates.'}
            </p>
          )}
        </Card>

        <Card>
          <h3 className="font-serif text-xl font-semibold">Start From Template</h3>
          {canStart ? (
            <form action={startWorkflowRun} className="mt-4 grid gap-3">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="templateId" value={template.id} />
              <Field label="Run title" name="title" defaultValue={template.name} />
              <Select label="Scope" name="scopeType" defaultValue="COLLECTION">
                <option value="COLLECTION">Collection</option>
                <option value="LOCATION">Location</option>
                <option value="PLANTS">Selected plants</option>
              </Select>
              <Select label="Location scope" name="locationId" defaultValue="">
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
              <details className="rounded-md border border-stone-200 bg-white/60 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Select specific plants</summary>
                <div className="mt-2 grid max-h-64 gap-2 overflow-auto">
                  {plants.map((plant) => (
                    <label key={plant.id} className="flex gap-2 rounded border border-stone-200 bg-white/70 p-2 text-sm">
                      <input type="checkbox" name="plantInstanceId" value={plant.id} />
                      <span><span className="font-mono text-xs font-semibold text-[#2f6b45]">{plant.plantId}</span> · {plantName(plant.plantDefinition)}</span>
                    </label>
                  ))}
                </div>
              </details>
              <Button>Start workflow</Button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-stone-600">You need logger access or above to start workflows.</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Workflow Builder</h3>
            <p className="mt-1 text-sm text-stone-600">{canEditTemplate ? 'Drag steps to reorder them. Each step is snapped into new runs when they start.' : 'Copy starter templates before editing their steps.'}</p>
          </div>
          {canEditTemplate && (
            <details className="rounded-md border border-stone-200 bg-white/60 p-2 text-sm">
              <summary className="cursor-pointer font-semibold">Add step</summary>
              <form action={addWorkflowStep} className="mt-3 grid gap-2">
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="templateId" value={template.id} />
                <input type="hidden" name="back" value={collectionPath(collection.slug, `/workflows/templates/${template.id}`)} />
                <Select label="Step type" name="stepType">
                  {workflowStepTypes.map((type) => <option key={type} value={type}>{workflowStepLabel(type)}</option>)}
                </Select>
                <Field label="Title" name="title" required />
                <TextArea label="Instructions" name="instructions" />
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked /> Required</label>
                <Button>Add step</Button>
              </form>
            </details>
          )}
        </div>

        {canEditTemplate ? (
          <WorkflowStepBuilder
            collectionSlug={collection.slug}
            templateId={template.id}
            steps={template.steps}
            back={collectionPath(collection.slug, `/workflows/templates/${template.id}`)}
          />
        ) : (
          <div className="mt-4 grid gap-3">
            {template.steps.map((step, index) => (
              <div key={step.id} className="rounded-lg border border-stone-200 bg-white/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Step {index + 1} · {workflowStepLabel(step.stepType)} · {step.required ? 'required' : 'optional'}</p>
                <h4 className="mt-1 font-serif text-xl font-semibold">{step.title}</h4>
                {step.instructions && <p className="mt-1 text-sm text-stone-600">{step.instructions}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {canManage && !template.isBuiltIn && (
        <Card className="border-red-200 bg-red-50 text-red-950">
          <h3 className="font-serif text-xl font-semibold">{template._count.runs > 0 ? 'Archive Template' : 'Delete Template'}</h3>
          <p className="mt-1 text-sm">
            {template._count.runs > 0
              ? 'This template has run history, so it can be archived but not hard-deleted.'
              : 'This unused custom template can be permanently deleted.'}
          </p>
          <form action={template._count.runs > 0 ? archiveWorkflowTemplate : deleteWorkflowTemplate} className="mt-3">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="templateId" value={template.id} />
            <DangerButton>{template._count.runs > 0 ? 'Archive template' : 'Delete template'}</DangerButton>
          </form>
        </Card>
      )}
      <p className="text-sm text-stone-600"><Link href={collectionPath(collection.slug, '/workflows')} className="underline">Back to workflows</Link></p>
    </div>
  )
}
