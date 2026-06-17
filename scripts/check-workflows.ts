import assert from 'node:assert/strict'
import {
  queueTaskForWorkflowStep,
  starterWorkflowTemplates,
  workflowOutputBehaviorLabel,
  workflowStepFamily,
} from '../lib/workflows'

assert.equal(queueTaskForWorkflowStep('WATER'), 'WATER')
assert.equal(queueTaskForWorkflowStep('PEST_CHECK'), 'PEST_CHECK')
assert.equal(queueTaskForWorkflowStep('CREATE_CARE_EVENT', 'WATERED'), 'WATER')
assert.equal(queueTaskForWorkflowStep('CREATE_CARE_EVENT', 'FERTILIZED'), null)
assert.equal(queueTaskForWorkflowStep('ADD_PHOTO'), null)

assert.equal(workflowStepFamily('ADD_PHOTO'), 'Input')
assert.equal(workflowStepFamily('DECISION_NOTE'), 'Decision')
assert.equal(workflowStepFamily('WATER'), 'Function')
assert.equal(workflowStepFamily('CREATE_REMINDER'), 'Output')

assert.equal(workflowOutputBehaviorLabel('RECORD_OR_CONFIRM'), 'Create record or confirm')
assert.ok(starterWorkflowTemplates.some((template) => template.name === 'New Arrival Quarantine'))
assert.ok(starterWorkflowTemplates.some((template) => template.steps.some(([stepType]) => stepType === 'ADD_PHOTO')))

console.info('Workflow invariant check passed.')
