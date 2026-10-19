import type { DeploymentJob } from '@/lib/deployment-agent'
export const deploymentStages = [
  { id: 'PREFLIGHT', label: 'Preflight', description: 'Checking deployment prerequisites', done: 'Environment checks passed' },
  { id: 'BACKUP', label: 'Backup', description: 'Creating a recovery backup', done: 'Recovery backup verified' },
  { id: 'FETCHING', label: 'Fetching', description: 'Retrieving the approved application source', done: 'Approved source retrieved' },
  { id: 'PREPARING', label: 'Preparing', description: 'Preparing deployment configuration', done: 'Deployment configuration prepared' },
  { id: 'BUILDING', label: 'Building', description: 'Building application containers', done: 'Application containers built' },
  { id: 'MIGRATING', label: 'Migrating', description: 'Applying database migrations', done: 'Database migrations applied' },
  { id: 'DEPLOYING', label: 'Deploying', description: 'Starting updated application services', done: 'Updated application services started' },
  { id: 'VERIFYING', label: 'Verifying', description: 'Checking application health', done: 'Application health verified' },
] as const
export type StageStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped'
export const terminalDeployment = (status?: string) => ['COMPLETED', 'FAILED', 'RECOVERY_REQUIRED', 'RECOVERED'].includes(status || '')
export const deploymentStatusLabel = (status: string) => ({ QUEUED: 'Queued', RUNNING: 'Running', COMPLETED: 'Completed', FAILED: 'Failed', RECOVERY_REQUIRED: 'Recovery required', RECOVERED: 'Recovered' }[status] || 'Status unknown')
export function deploymentProgress(job: DeploymentJob) {
  const failed = ['FAILED', 'RECOVERY_REQUIRED', 'RECOVERED'].includes(job.status)
  const stage = failed ? job.data.failedStage || job.stage : job.stage
  const index = job.stage === 'COMPLETED' && job.status === 'RUNNING' ? deploymentStages.length : deploymentStages.findIndex(item => item.id === stage)
  const success = job.status === 'COMPLETED'
  // The version-one agent advances sequentially only after each operation succeeds.
  // Migration metadata is the explicit exception to that ordered-stage contract.
  const determinate = success || job.status === 'QUEUED' || index >= 0
  const rows = deploymentStages.map((item, position) => {
    let status: StageStatus = 'pending'
    const reached = success || index >= position
    if (failed && index === position) status = 'failed'
    else if (reached && item.id === 'MIGRATING' && (job.data.migrationStatus === 'NOT_REQUIRED' || job.data.hasMigrations === false)) status = 'skipped'
    else if (success || index > position) status = 'completed'
    else if (job.status === 'RUNNING' && index === position) status = 'active'
    return { ...item, status }
  })
  const completed = rows.filter(item => item.status === 'completed').length
  const skipped = rows.filter(item => item.status === 'skipped').length
  return { rows, completed, skipped, settled: completed + skipped, total: rows.length, determinate, success, active: rows.find(row => row.status === 'active') }
}
