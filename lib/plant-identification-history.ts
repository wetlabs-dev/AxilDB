import type { PrismaClient } from '@prisma/client'
import { collectionPath } from '@/lib/collections'
import { findMatchingValidatedDefinition } from '@/lib/validated-definitions'
import { acceptedPlantName } from '@/lib/utils'

export type PlantIdentificationSuggestion = {
  genus?: string | null
  species?: string | null
  hybridNotation?: string | null
  cultivarName?: string | null
  confidenceLevel?: string | null
  confidenceExplanation?: string | null
  possibleAlternatives?: string[]
  suggestedAliases?: string[]
  suggestedDescription?: string | null
  warnings?: string[]
  suggestedReferences?: string[]
}

function text(value?: string | null) {
  return String(value || '').trim()
}

export function identificationDisplayName(input: {
  genus?: string | null
  species?: string | null
  hybridNotation?: string | null
  cultivarName?: string | null
}) {
  return acceptedPlantName({ ...input, genus: text(input.genus) || 'Unknown genus' })
}

export function normalizePlantIdentificationSuggestion(raw: any): PlantIdentificationSuggestion {
  return {
    genus: text(raw?.genus) || null,
    species: text(raw?.species).toLowerCase() || null,
    hybridNotation: text(raw?.hybridNotation) || null,
    cultivarName: text(raw?.cultivarName) || null,
    confidenceLevel: text(raw?.confidenceLevel).toUpperCase() || null,
    confidenceExplanation: text(raw?.confidenceExplanation) || null,
    possibleAlternatives: Array.isArray(raw?.possibleAlternatives) ? raw.possibleAlternatives.map(text).filter(Boolean).slice(0, 5) : [],
    suggestedAliases: Array.isArray(raw?.suggestedAliases) ? raw.suggestedAliases.map(text).filter(Boolean).slice(0, 8) : [],
    suggestedDescription: text(raw?.suggestedDescription) || null,
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map(text).filter(Boolean).slice(0, 5) : [],
    suggestedReferences: Array.isArray(raw?.suggestedReferences) ? raw.suggestedReferences.map(text).filter(Boolean).slice(0, 5) : [],
  }
}

export function localDefinitionIdentityWhere(collectionId: string, input: PlantIdentificationSuggestion) {
  const genus = text(input.genus)
  const species = text(input.species).toLowerCase()
  const hybridNotation = text(input.hybridNotation)
  const cultivarName = text(input.cultivarName)
  if (!genus) return null

  return {
    collectionId,
    genus: { equals: genus, mode: 'insensitive' as const },
    AND: [
      species
        ? { species: { equals: species, mode: 'insensitive' as const } }
        : { OR: [{ species: null }, { species: '' }] },
      hybridNotation
        ? { hybridNotation: { equals: hybridNotation, mode: 'insensitive' as const } }
        : { OR: [{ hybridNotation: null }, { hybridNotation: '' }] },
      cultivarName
        ? { cultivarName: { equals: cultivarName, mode: 'insensitive' as const } }
        : { OR: [{ cultivarName: null }, { cultivarName: '' }] },
    ],
  }
}

export async function findMatchingPlantDefinition(client: PrismaClient, collectionId: string, input: PlantIdentificationSuggestion) {
  const localWhere = localDefinitionIdentityWhere(collectionId, input)
  if (localWhere) {
    const local = await client.plantDefinition.findFirst({ where: localWhere })
    if (local) return { definition: local, matchType: 'LOCAL' as const }
  }

  const validated = await findMatchingValidatedDefinition(client, input)
  if (validated) return { definition: validated, matchType: 'VALIDATED' as const }
  return null
}

export function createDefinitionFromIdentificationHref(collectionSlug: string, logId: string) {
  return `${collectionPath(collectionSlug, '/plants')}?fromIdentification=${encodeURIComponent(logId)}`
}

export function suggestedAliasesForForm(suggestion: PlantIdentificationSuggestion) {
  return (suggestion.suggestedAliases || []).map((name) => ({
    name,
    aliasType: 'COMMON_NAME',
    confidence: 'AI_DETERMINED',
    source: 'AxilDB ID My Plant',
    notes: suggestion.confidenceExplanation || 'AI-assisted identification draft.',
  }))
}
