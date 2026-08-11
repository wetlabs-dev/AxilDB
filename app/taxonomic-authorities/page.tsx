import Link from 'next/link'
import { ExternalLink, LibraryBig, Search, ShieldCheck } from 'lucide-react'
import {
  createTaxonomicAuthority,
  createTaxonomicAuthorityPublication,
  createTaxonomicAuthorityScopeRule,
  deleteTaxonomicAuthority,
  deleteTaxonomicAuthorityPublication,
  deleteTaxonomicAuthorityScopeRule,
  rematchTaxonomicAuthorities,
  updateTaxonomicAuthority,
} from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { AddPanel, Button, Card, Field, Select, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionAdmin } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { TAXONOMIC_AUTHORITY_TYPES, TAXONOMIC_SCOPE_RANKS, taxonomicAuthorityWhere } from '@/lib/taxonomic-authorities'

const authorityTypeLabel = new Map<string, string>(TAXONOMIC_AUTHORITY_TYPES)

function validWebUrl(value?: string | null) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function authorityResources(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is { label: string; url: string } => Boolean(item && typeof item === 'object' && typeof item.label === 'string' && typeof item.url === 'string'))
}

function AuthorityFields({ authority }: { authority?: any }) {
  return <>
    <Field label="Name" name="name" required defaultValue={authority?.name} />
    <Field label="Abbreviation" name="abbreviation" defaultValue={authority?.abbreviation} />
    <Select label="Authority type" name="authorityType" defaultValue={authority?.authorityType || 'OTHER'}>
      {TAXONOMIC_AUTHORITY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
    <TextArea label="Description" name="description" defaultValue={authority?.description} wrapperClassName="lg:col-span-3" />
    <Field label="Website" name="website" type="url" defaultValue={authority?.website} />
    <Field label="Official registration page" name="registrationUrl" type="url" defaultValue={authority?.registrationUrl} />
    <Field label="Official cultivar search" name="cultivarSearchUrl" type="url" defaultValue={authority?.cultivarSearchUrl} />
    <Field label="Membership page" name="membershipUrl" type="url" defaultValue={authority?.membershipUrl} />
    <Field label="External authority record" help="Canonical source, such as the official ICRA directory record." name="externalAuthorityUrl" type="url" defaultValue={authority?.externalAuthorityUrl} wrapperClassName="lg:col-span-2" />
    <TextArea label="Other useful resources" help="One per line in the format: Resource label | https://example.org" name="otherResources" defaultValue={authorityResources(authority?.otherResourcesJson).map((resource) => `${resource.label} | ${resource.url}`).join('\n')} wrapperClassName="lg:col-span-3" />
    <TextArea label="Local notes" help="Preserved during future imports and authority metadata updates." name="notes" defaultValue={authority?.notes} wrapperClassName="lg:col-span-3" />
  </>
}

export default async function TaxonomicAuthoritiesPage({ searchParams }: { searchParams: Promise<{ q?: string; rematched?: string }> }) {
  const { collection } = await requireCollectionAdmin()
  const sp = await searchParams
  const q = String(sp.q || '').trim()
  const authorities = await prisma.taxonomicAuthority.findMany({
    where: {
      AND: [taxonomicAuthorityWhere(collection.id), q ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { abbreviation: { contains: q, mode: 'insensitive' } },
        { website: { contains: q, mode: 'insensitive' } },
        { authorityType: { contains: q, mode: 'insensitive' } },
        { scopeRules: { some: { taxonName: { contains: q, mode: 'insensitive' } } } },
        { publications: { some: { name: { contains: q, mode: 'insensitive' } } } },
      ] } : {}],
    },
    include: {
      scopeRules: { orderBy: [{ priority: 'desc' }, { rank: 'asc' }, { taxonName: 'asc' }] },
      publications: { orderBy: { name: 'asc' } },
      plantDefinitions: { select: { id: true, collectionId: true, genus: true, species: true, cultivarName: true } },
      definitionMatches: { select: { plantDefinitionId: true } },
    },
    orderBy: [{ collectionId: 'desc' }, { name: 'asc' }],
  })
  const [definitions, allMatches] = await Promise.all([
    prisma.plantDefinition.findMany({
      where: { collectionId: collection.id },
      select: { id: true, genus: true, species: true, cultivarName: true, taxonomicAuthorityId: true, taxonomicAuthoritySource: true },
    }),
    prisma.plantDefinitionAuthorityMatch.findMany({
      where: { plantDefinition: { collectionId: collection.id } },
      select: { plantDefinitionId: true },
    }),
  ])
  const matchCounts = new Map<string, number>()
  for (const match of allMatches) matchCounts.set(match.plantDefinitionId, (matchCounts.get(match.plantDefinitionId) || 0) + 1)
  const unmatched = definitions.filter((definition) => !definition.taxonomicAuthorityId && definition.taxonomicAuthoritySource !== 'NONE').length
  const ambiguous = [...matchCounts.values()].filter((count) => count > 1).length
  const overrides = definitions.filter((definition) => definition.taxonomicAuthoritySource === 'MANUAL').length
  const noScope = authorities.filter((authority) => authority.scopeRules.length === 0).length
  const malformedUrls = authorities.filter((authority) => [authority.website, authority.registrationUrl, authority.cultivarSearchUrl, authority.membershipUrl, authority.externalAuthorityUrl].some((url) => !validWebUrl(url))).length
  const unhealthyUrls = authorities.filter((authority) => authority.urlHealthStatus === 'BROKEN' || authority.urlHealthStatus === 'PARTIAL').length

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-serif text-3xl font-bold">Taxonomic Authorities</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--ax-muted)]">Official registries, scientific societies, institutions, and other bodies responsible for botanical governance and cultivar registration.</p>
      </div>
      <form action={rematchTaxonomicAuthorities}>
        <input type="hidden" name="collectionSlug" value={collection.slug} />
        <Button>Re-evaluate plant matches</Button>
      </form>
    </div>

    {sp.rematched === '1' && <div className="rounded-md border border-[#9fbd91] bg-[#edf3e6] px-4 py-3 text-sm text-[#255537]">Authority matches were refreshed. Manual overrides were preserved.</div>}

    <Card>
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#2f6b45]" /><h3 className="font-serif text-xl font-bold">Authority diagnostics</h3></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['Unmatched definitions', unmatched], ['Ambiguous matches', ambiguous], ['Manual overrides', overrides],
          ['Authorities without scope', noScope], ['Malformed resource URLs', malformedUrls], ['Unhealthy official links', unhealthyUrls],
        ].map(([label, value]) => <div key={label} className="rounded-md border border-[var(--ax-border)] bg-[var(--ax-surface-muted)] p-3"><strong className="block text-xl">{value}</strong><span className="text-xs text-[var(--ax-muted)]">{label}</span></div>)}
      </div>
    </Card>

    <form className="flex min-w-0 gap-2" action={collectionPath(collection.slug, '/taxonomic-authorities')}>
      <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-500" /><input className="w-full rounded-md border border-stone-300 bg-[#fffdf7] py-2 pl-9 pr-3 text-sm" name="q" defaultValue={q} placeholder="Search name, abbreviation, scope, publication, website, or type" /></label>
      <Button>Search</Button>
    </form>

    <AddPanel label="Create Taxonomic Authority">
      <form action={createTaxonomicAuthority} className="grid gap-3 lg:grid-cols-3">
        <input type="hidden" name="collectionSlug" value={collection.slug} />
        <AuthorityFields />
        <Button className="justify-self-start lg:col-span-3">Create authority</Button>
      </form>
    </AddPanel>

    <div className="grid gap-4">
      {authorities.map((authority) => {
        const genera = new Set(authority.plantDefinitions.map((definition) => definition.genus))
        const species = new Set(authority.plantDefinitions.map((definition) => `${definition.genus} ${definition.species}`))
        const collections = new Set(authority.plantDefinitions.map((definition) => definition.collectionId))
        const cultivars = authority.plantDefinitions.filter((definition) => definition.cultivarName).length
        const imported = authority.collectionId === null
        const resources = authorityResources(authority.otherResourcesJson)
        return <details id={`authority-${authority.id}`} key={authority.id} className="group overflow-hidden rounded-lg border border-[var(--ax-border)] bg-[var(--ax-surface)] shadow-sm">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 hover:bg-[var(--ax-surface-muted)]">
            <span><strong className="font-serif text-xl">{authority.name}</strong>{authority.abbreviation && <span className="ml-2 text-sm font-semibold text-[#2f6b45]">{authority.abbreviation}</span>}<span className="mt-1 block text-xs uppercase tracking-wide text-[var(--ax-muted)]">{authorityTypeLabel.get(authority.authorityType) || authority.authorityType}{imported ? ' · shared registry' : ''}</span></span>
            <span className="text-sm text-[var(--ax-muted)]">{authority.plantDefinitions.length} selected · {authority.definitionMatches.length} matched · {authority.scopeRules.length} scope rules</span>
          </summary>
          <div className="space-y-5 border-t border-[var(--ax-border)] p-4">
            {authority.description && <p className="max-w-4xl text-sm leading-6">{authority.description}</p>}
            <div className="flex flex-wrap gap-2 text-sm">
              {[[authority.website, 'Website'], [authority.registrationUrl, 'Registration'], [authority.cultivarSearchUrl, 'Cultivar search'], [authority.membershipUrl, 'Membership'], [authority.externalAuthorityUrl, authority.authorityType === 'ICRA' ? 'View official ICRA record' : 'Official authority record']].filter(([url]) => url).map(([url, label]) => <a key={label} href={String(url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[var(--ax-border)] px-2.5 py-1.5 font-semibold text-[#2f6b45]">{label}<ExternalLink className="h-3.5 w-3.5" /></a>)}
              {resources.map((resource) => <a key={`${resource.label}:${resource.url}`} href={resource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[var(--ax-border)] px-2.5 py-1.5 font-semibold text-[#2f6b45]">{resource.label}<ExternalLink className="h-3.5 w-3.5" /></a>)}
            </div>

            <section><h4 className="font-semibold">Taxonomic scope</h4><div className="mt-2 flex flex-wrap gap-2">{authority.scopeRules.map((rule) => <span key={rule.id} className="inline-flex items-center gap-2 rounded-full border border-[#b7caa9] bg-[#edf3e6] px-3 py-1 text-sm text-[#255537]"><strong>{rule.rank.toLowerCase()}</strong>{rule.taxonName}{!imported && <form action={deleteTaxonomicAuthorityScopeRule}><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={rule.id} /><button aria-label={`Remove ${rule.rank} ${rule.taxonName}`} className="font-bold">×</button></form>}</span>)}{authority.scopeRules.length === 0 && <span className="text-sm text-[var(--ax-muted)]">No scope rules. This authority cannot be matched automatically.</span>}</div>
              {!imported && <form action={createTaxonomicAuthorityScopeRule} className="mt-3 grid gap-2 md:grid-cols-5"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="taxonomicAuthorityId" value={authority.id} /><Select label="Rank" name="rank" defaultValue="GENUS">{TAXONOMIC_SCOPE_RANKS.map((rank) => <option key={rank}>{rank}</option>)}</Select><Field label="Taxon" name="taxonName" required /><Field label="Qualifier" name="qualifier" /><Field label="Rule priority" name="priority" type="number" defaultValue="0" /><Button className="self-end">Add scope</Button></form>}
            </section>

            <section><h4 className="flex items-center gap-2 font-semibold"><LibraryBig className="h-4 w-4" />Publications</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{authority.publications.map((publication) => <div key={publication.id} className="rounded-md border border-[var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 text-sm"><div className="flex justify-between gap-2"><strong>{publication.url ? <a href={publication.url} target="_blank" rel="noreferrer" className="text-[#2f6b45] underline">{publication.name}</a> : publication.name}</strong>{!imported && <form action={deleteTaxonomicAuthorityPublication}><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={publication.id} /><button aria-label={`Remove ${publication.name}`}>×</button></form>}</div>{publication.purpose && <p>{publication.purpose}</p>}{publication.notes && <p className="text-xs text-[var(--ax-muted)]">{publication.notes}</p>}</div>)}{authority.publications.length === 0 && <p className="text-sm text-[var(--ax-muted)]">No official publications recorded.</p>}</div>
              {!imported && <form action={createTaxonomicAuthorityPublication} className="mt-3 grid gap-2 md:grid-cols-4"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="taxonomicAuthorityId" value={authority.id} /><Field label="Publication name" name="name" required /><Field label="URL" name="url" type="url" /><Field label="Purpose" name="purpose" /><Button className="self-end">Add publication</Button></form>}
            </section>

            <section><h4 className="font-semibold">Collection statistics</h4><p className="mt-1 text-sm text-[var(--ax-muted)]">{authority.plantDefinitions.length} plant definitions · {collections.size} collections · {genera.size} genera · {species.size} species · {cultivars} cultivars · {cultivars} potential registrations</p>{authority.lastUrlCheckAt && <p className="mt-1 text-xs text-[var(--ax-muted)]">Official links: {authority.urlHealthStatus || 'unchecked'} · checked {authority.lastUrlCheckAt.toLocaleString()}</p>}</section>

            {imported ? <p className="rounded-md border border-[var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 text-sm">This shared registry record is read-only here. Future provider syncs may update official metadata while preserving collection-local overrides and notes.</p> : <>
              <details className="rounded-md border border-[var(--ax-border)]"><summary className="cursor-pointer p-3 font-semibold">Edit authority details and resources</summary><form action={updateTaxonomicAuthority} className="grid gap-3 border-t border-[var(--ax-border)] p-3 lg:grid-cols-3"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={authority.id} /><AuthorityFields authority={authority} /><Button className="justify-self-start lg:col-span-3">Save authority</Button></form></details>
              <form action={deleteTaxonomicAuthority} className="border-t border-[var(--ax-border)] pt-4"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={authority.id} /><ConfirmDeleteButton title="Delete Taxonomic Authority?" message={`This removes ${authority.name}. Plant definitions retain their taxonomy and are immediately re-evaluated against the remaining authority scopes.`} confirmLabel="Delete authority">Delete authority</ConfirmDeleteButton></form>
            </>}
          </div>
        </details>
      })}
      {authorities.length === 0 && <Card>No Taxonomic Authorities found. <Link className="text-[#2f6b45] underline" href="#">Create one above</Link> or continue without an authority.</Card>}
    </div>
  </div>
}
