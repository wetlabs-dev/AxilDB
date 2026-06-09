import Link from 'next/link'
import { PlantImage } from '@/components/PlantImage'
import { collectionPath } from '@/lib/collections'
import { createDefinitionFromIdentificationHref, identificationDisplayName } from '@/lib/plant-identification-history'
import { formatDateTime } from '@/lib/time'
import { plantName } from '@/lib/utils'

type DefinitionSummary = {
  id: string
  collectionId?: string | null
  isValidated?: boolean | null
  genus: string
  species: string
  hybridNotation?: string | null
  cultivarName?: string | null
}

type IdentificationLog = {
  id: string
  collectionId: string
  description?: string | null
  knownNames?: string | null
  genus?: string | null
  species?: string | null
  hybridNotation?: string | null
  cultivarName?: string | null
  confidenceLevel?: string | null
  confidenceExplanation?: string | null
  alternativesJson?: unknown
  suggestedAliasesJson?: unknown
  warningsJson?: unknown
  suggestedDescription?: string | null
  uploadedPhoto?: any
  matchedPlantDefinition?: DefinitionSummary | null
  createdPlantDefinition?: DefinitionSummary | null
  status: string
  createdAt: Date
  user?: { email: string } | null
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
}

function definitionHref(collectionSlug: string, definition?: DefinitionSummary | null) {
  if (!definition) return null
  if (definition.collectionId) return collectionPath(collectionSlug, `/plants/${definition.id}/edit`)
  return `${collectionPath(collectionSlug, '/validated-definitions')}#definition-${definition.id}`
}

function statusLabel(status: string) {
  if (status === 'CREATED_DEFINITION') return 'Created definition'
  if (status === 'APPLIED_TO_FORM') return 'Applied to form'
  if (status === 'DISMISSED') return 'Dismissed'
  return 'Result only'
}

export function PlantIdentificationHistoryList({
  logs,
  collectionSlug,
  timezone,
  showUser = false,
  canCreateDefinitions = false,
}: {
  logs: IdentificationLog[]
  collectionSlug: string
  timezone?: string | null
  showUser?: boolean
  canCreateDefinitions?: boolean
}) {
  if (logs.length === 0) {
    return <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No ID My Plant history yet.</p>
  }

  return (
    <div className="grid gap-3">
      {logs.map((log) => {
        const createdHref = definitionHref(collectionSlug, log.createdPlantDefinition)
        const matchedHref = definitionHref(collectionSlug, log.matchedPlantDefinition)
        const alternatives = stringList(log.alternativesJson)
        const aliases = stringList(log.suggestedAliasesJson)
        const warnings = stringList(log.warningsJson)
        const canCreateFromLog = canCreateDefinitions && !log.createdPlantDefinition

        return (
          <div key={log.id} className="grid gap-3 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 lg:grid-cols-[7rem_minmax(0,1fr)]">
            <div className="aspect-square overflow-hidden rounded-lg border border-[color:var(--ax-border)] bg-[#d6dfc9]/45">
              <PlantImage src={log.uploadedPhoto || null} alt={identificationDisplayName(log)} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl font-semibold">{identificationDisplayName(log)}</h3>
                  <p className="text-sm text-stone-600">
                    {formatDateTime(log.createdAt, timezone || undefined)} · {statusLabel(log.status)}
                    {showUser && log.user ? ` · submitted by ${log.user.email}` : ''}
                  </p>
                </div>
                {log.confidenceLevel && (
                  <span className="rounded-full border border-[#dfcc87] bg-[#fff8dc] px-3 py-1 text-xs font-bold text-[#6f541f]">
                    {log.confidenceLevel} confidence
                  </span>
                )}
              </div>

              {log.confidenceExplanation && <p className="mt-2 text-sm text-stone-700">{log.confidenceExplanation}</p>}
              {log.suggestedDescription && <p className="mt-2 text-sm text-stone-700">{log.suggestedDescription}</p>}
              {(log.description || log.knownNames) && (
                <div className="mt-2 grid gap-1 text-sm text-stone-600">
                  {log.description && <p><span className="font-semibold">Submitted description:</span> {log.description}</p>}
                  {log.knownNames && <p><span className="font-semibold">Known names:</span> {log.knownNames}</p>}
                </div>
              )}
              {aliases.length > 0 && <p className="mt-2 text-sm text-stone-600">Suggested aliases: {aliases.join(', ')}</p>}
              {alternatives.length > 0 && <p className="mt-2 text-sm text-stone-600">Alternatives: {alternatives.join(', ')}</p>}
              {warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-[#9a3f35]">{warning}</p>)}

              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {log.createdPlantDefinition && createdHref && (
                  <Link href={createdHref} className="rounded-md bg-[#2f6b45] px-3 py-1.5 font-semibold text-white">
                    Open created definition
                  </Link>
                )}
                {!log.createdPlantDefinition && log.matchedPlantDefinition && matchedHref && (
                  <Link href={matchedHref} className="rounded-md border border-[#b7caa9] bg-[#edf3e6] px-3 py-1.5 font-semibold text-[#255537]">
                    Matches {plantName(log.matchedPlantDefinition)}
                  </Link>
                )}
                {canCreateFromLog && (
                  <Link href={createDefinitionFromIdentificationHref(collectionSlug, log.id)} className="rounded-md bg-[#2f6b45] px-3 py-1.5 font-semibold text-white">
                    Create Plant Definition from this ID
                  </Link>
                )}
                {!log.matchedPlantDefinition && !log.createdPlantDefinition && (
                  <span className="rounded-md border border-stone-200 bg-white/60 px-3 py-1.5 text-stone-600">No matching definition yet</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
