import 'server-only'
import { readFile } from 'node:fs/promises'
import { request } from 'node:http'
import { createHmac, randomBytes } from 'node:crypto'

export const deploymentProtocol = 1
export type DeploymentOperation =
  | 'STATUS'
  | 'CHECK_UPDATES'
  | 'PREFLIGHT'
  | 'START_UPGRADE'
  | 'JOB'
  | 'EVENTS'
  | 'RECOVERY_OPTIONS'
  | 'ROLLBACK'
  | 'RECONCILE'
export type DeploymentEvent = {
  id: number
  job_id: string
  timestamp: string
  stage: string
  level: string
  message: string
}
export type DeploymentJob = {
  id: string
  revision: string
  previous: string | null
  actor: string
  stage: string
  status: string
  created: string
  started: string | null
  finished: string | null
  data: {
    backup?: string
    migrationStatus?: string
    hasMigrations?: boolean
    error?: string
    failedStage?: string
    health?: { status: string }
    recoveryResult?: string
  }
}
export type UpdateCheck = {
  current: string
  revision: string
  branch: string
  ahead: number
  eligible: boolean
  clean: boolean
  fastForward: boolean
  commits: Array<{ revision: string; subject: string }>
}
export type Preflight = {
  ready: boolean
  revision: string
  previous: string
  migrations: string[]
  checks: Array<{ name: string; ok: boolean; message?: string }>
}
export type DeploymentStatus = {
  protocol: number
  application: string
  revision: string | null
  branch: string
  deployedAt: string | null
  health: { status: string; message?: string }
  checked: UpdateCheck | null
  activeJob: DeploymentJob | null
  history: DeploymentJob[]
  lastSuccessfulUpgrade: DeploymentJob | null
}
export type RecoveryOptions = {
  applicationRollback: boolean
  reasons: string[]
  manualRecovery: string
}

export function deploymentAgentConfigured() {
  return Boolean(
    process.env.AXILDB_DEPLOY_AGENT_SOCKET &&
      process.env.AXILDB_DEPLOY_AGENT_KEY_FILE
  )
}
export async function callDeploymentAgent<T>(
  operation: DeploymentOperation,
  actor: string,
  fields: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<T> {
  if (!deploymentAgentConfigured())
    throw new Error(
      'Install and configure the independent host deployment agent first.'
    )
  const secret = (
    await readFile(process.env.AXILDB_DEPLOY_AGENT_KEY_FILE!, 'utf8')
  ).trim()
  const body = JSON.stringify({
    ...fields,
    protocol: deploymentProtocol,
    operation,
    actor,
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomBytes(16).toString('hex')
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${body}`)
    .digest('hex')
  return new Promise((resolve, reject) => {
    const req = request(
      {
        signal,
        socketPath: process.env.AXILDB_DEPLOY_AGENT_SOCKET!,
        path: '/v1/operations',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-AxilDB-Time': timestamp,
          'X-AxilDB-Nonce': nonce,
          'X-AxilDB-Signature': signature,
        },
      },
      (res) => {
        let data = ''
        res.on('error', reject)
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
          if (data.length > 2_000_000)
            req.destroy(new Error('Agent response exceeded its limit.'))
        })
        res.on('end', () => {
          try {
            const value = JSON.parse(data)
            if (res.statusCode !== 200)
              return reject(
                new Error(value.error || 'Agent operation was rejected.')
              )
            if (value.protocol !== deploymentProtocol)
              return reject(
                new Error(
                  'Deployment agent protocol mismatch. Upgrade the host agent separately.'
                )
              )
            resolve(value.data as T)
          } catch {
            reject(new Error('Deployment agent returned an invalid response.'))
          }
        })
      }
    )
    req.setTimeout(
      operation === 'PREFLIGHT'
        ? 300_000
        : operation === 'CHECK_UPDATES'
          ? 180_000
          : 45_000,
      () =>
        req.destroy(
          new Error(
            'Agent request timed out. Check deployment history before retrying.'
          )
        )
    )
    req.on('error', () =>
      reject(
        new Error(
          'The host deployment agent is unavailable. An existing job may still be running; reconnect to retrieve its state.'
        )
      )
    )
    req.end(body)
  })
}
