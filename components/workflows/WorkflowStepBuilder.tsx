'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { reorderWorkflowSteps } from '@/app/workflow-actions'
import { Button, DangerButton, Field, Select, TextArea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { workflowOutputBehaviorLabel, workflowStepFamily, workflowStepLabel, workflowStepTypes } from '@/lib/workflows'
import { deleteWorkflowStep, duplicateWorkflowStep, moveWorkflowStep, updateWorkflowStep } from '@/app/workflow-actions'

export type WorkflowBuilderStep = {
  id: string
  stepType: string
  title: string
  instructions: string | null
  required: boolean
  sortOrder: number
  configJson: unknown
  outputBehavior: string | null
}

function arrayMove<T>(items: T[], from: number, to: number) {
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

function configNote(value: unknown) {
  if (value && typeof value === 'object' && 'note' in value) return String((value as { note?: unknown }).note || '')
  return ''
}

function familyClass(family: string) {
  if (family === 'Decision') return 'border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-400/40 dark:bg-purple-950/20 dark:text-purple-100'
  if (family === 'Function') return 'border-green-200 bg-green-50 text-green-900 dark:border-green-400/40 dark:bg-green-950/20 dark:text-green-100'
  if (family === 'Output') return 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-400/40 dark:bg-blue-950/20 dark:text-blue-100'
  return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/20 dark:text-amber-100'
}

function SortableStepCard({
  step,
  index,
  collectionSlug,
  templateId,
  back,
}: {
  step: WorkflowBuilderStep
  index: number
  collectionSlug: string
  templateId: string
  back: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const family = workflowStepFamily(step.stepType)
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('rounded-lg border border-stone-200 bg-white/65 p-3 shadow-sm transition dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-solid)]', isDragging && 'opacity-50')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-[color:var(--ax-muted)]">Step {index + 1} · {workflowStepLabel(step.stepType)} · {step.required ? 'required' : 'optional'}</span>
            <span className={cn('rounded-full border px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.12em]', familyClass(family))}>{family}</span>
            <span className="rounded-full border border-stone-200 bg-white/70 px-2 py-0.5 text-[0.68rem] font-semibold text-stone-600 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-muted-strong)]">{workflowOutputBehaviorLabel(step.outputBehavior)}</span>
          </div>
          <h4 className="mt-1 font-serif text-xl font-semibold">{step.title}</h4>
          {step.instructions && <p className="mt-1 text-sm text-stone-600 dark:text-[color:var(--ax-muted)]">{step.instructions}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex cursor-grab items-center gap-1 rounded-md border border-stone-300 bg-white/80 px-2 py-1 text-xs font-semibold text-stone-600 active:cursor-grabbing dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-muted-strong)]"
            aria-label={`Drag step ${index + 1}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
            Drag
          </button>
          <form action={moveWorkflowStep}>
            <input type="hidden" name="collectionSlug" value={collectionSlug} />
            <input type="hidden" name="stepId" value={step.id} />
            <input type="hidden" name="direction" value="up" />
            <input type="hidden" name="back" value={back} />
            <Button className="px-2 py-1 text-xs">Up</Button>
          </form>
          <form action={moveWorkflowStep}>
            <input type="hidden" name="collectionSlug" value={collectionSlug} />
            <input type="hidden" name="stepId" value={step.id} />
            <input type="hidden" name="direction" value="down" />
            <input type="hidden" name="back" value={back} />
            <Button className="px-2 py-1 text-xs">Down</Button>
          </form>
          <form action={duplicateWorkflowStep}>
            <input type="hidden" name="collectionSlug" value={collectionSlug} />
            <input type="hidden" name="stepId" value={step.id} />
            <input type="hidden" name="back" value={back} />
            <Button className="px-2 py-1 text-xs">Duplicate</Button>
          </form>
          <form action={deleteWorkflowStep}>
            <input type="hidden" name="collectionSlug" value={collectionSlug} />
            <input type="hidden" name="stepId" value={step.id} />
            <input type="hidden" name="back" value={back} />
            <DangerButton className="px-2 py-1 text-xs">Remove</DangerButton>
          </form>
        </div>
      </div>
      <details className="mt-3 rounded-md border border-stone-200 bg-[#fffaf0] p-3 text-sm dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)]">
        <summary className="cursor-pointer font-semibold">Edit step</summary>
        <form action={updateWorkflowStep} className="mt-3 grid gap-2">
          <input type="hidden" name="collectionSlug" value={collectionSlug} />
          <input type="hidden" name="stepId" value={step.id} />
          <input type="hidden" name="back" value={back} />
          <Select label="Step type" name="stepType" defaultValue={step.stepType}>
            {workflowStepTypes.map((type) => <option key={type} value={type}>{workflowStepLabel(type)}</option>)}
          </Select>
          <Field label="Title" name="title" defaultValue={step.title} />
          <TextArea label="Instructions" name="instructions" defaultValue={step.instructions || ''} />
          <TextArea label="Config notes" name="configJson" defaultValue={configNote(step.configJson)} />
          <Select label="Output behavior" name="outputBehavior" defaultValue={step.outputBehavior || 'RECORD_OR_CONFIRM'}>
            <option value="RECORD_OR_CONFIRM">Create record or confirm</option>
            <option value="RECORD_ONLY">Create record</option>
            <option value="CONFIRM_ONLY">Confirm only</option>
          </Select>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={step.required} /> Required</label>
          <Button>Save step</Button>
        </form>
      </details>
    </div>
  )
}

export function WorkflowStepBuilder({
  collectionSlug,
  templateId,
  steps,
  back,
}: {
  collectionSlug: string
  templateId: string
  steps: WorkflowBuilderStep[]
  back: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState(() => [...steps].sort((left, right) => left.sortOrder - right.sortOrder))
  const [activeLabel, setActiveLabel] = useState('')
  const [status, setStatus] = useState('Drag steps to reorder. Changes save automatically.')
  const [isPending, startTransition] = useTransition()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = useMemo(() => rows.map((row) => row.id), [rows])

  const persistOrder = (orderedIds: string[]) => {
    const previous = rows
    const byId = new Map(rows.map((row) => [row.id, row]))
    const next = orderedIds.map((id, index) => ({ ...byId.get(id)!, sortOrder: (index + 1) * 10 }))
    setRows(next)
    startTransition(async () => {
      try {
        setStatus('Saving order...')
        await reorderWorkflowSteps({ collectionSlug, templateId, orderedStepIds: orderedIds })
        setStatus('Step order saved.')
        router.refresh()
      } catch (error) {
        setRows(previous)
        setStatus(error instanceof Error ? error.message : 'Step order could not be saved.')
      }
    })
  }

  const handleDragStart = (event: DragStartEvent) => {
    const step = rows.find((row) => row.id === String(event.active.id))
    setActiveLabel(step ? step.title : 'Workflow step')
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLabel('')
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : ''
    if (!overId || activeId === overId) return
    const oldIndex = ids.indexOf(activeId)
    const newIndex = ids.indexOf(overId)
    if (oldIndex < 0 || newIndex < 0) return
    persistOrder(arrayMove(ids, oldIndex, newIndex))
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600 dark:text-[color:var(--ax-muted)]">{isPending ? 'Saving...' : status}</p>
      </div>
      {rows.length === 0 && <p className="rounded-md border border-stone-200 bg-white/60 p-3 text-sm text-stone-600">No steps yet. Add a step to make this workflow runnable.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="grid gap-3">
            {rows.map((step, index) => (
              <SortableStepCard key={step.id} step={step} index={index} collectionSlug={collectionSlug} templateId={templateId} back={back} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeLabel ? <div className="rounded-lg border border-[#8fa58f] bg-[#fffdf7] px-3 py-2 text-sm font-semibold shadow-lg dark:border-[color:var(--ax-primary)] dark:bg-[color:var(--ax-surface-solid)] dark:text-[color:var(--ax-heading)]">{activeLabel}</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
