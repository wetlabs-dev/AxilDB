import { mergePlantTags, savePlantTag, setPlantTagActive } from '@/app/plant-tag-actions'
import { PlantTagChip } from '@/components/PlantTagChip'
import { AddPanel, Button, Card, Field, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionGardener } from '@/lib/collections'
import { plantTagCategories, plantTagColors, plantTagIcons, tagCategoryLabel } from '@/lib/plant-tags'
import { prisma } from '@/lib/prisma'

const selectClass = 'rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-input-bg)] px-2.5 py-2 text-sm'

function TagFields({ tag }: { tag?: any }) {
  return <>
    <Field label="Name" name="name" defaultValue={tag?.name} required />
    <label className="grid gap-1 text-sm font-medium">Category<select className={selectClass} name="category" defaultValue={tag?.category || 'OTHER'}>{plantTagCategories.map((item) => <option key={item} value={item}>{tagCategoryLabel(item)}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium">Themed icon<select className={selectClass} name="icon" defaultValue={tag?.icon || 'tag'}>{plantTagIcons.map((item) => <option key={item} value={item}>{item.replaceAll('-', ' ')}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium">Color<select className={selectClass} name="colorToken" defaultValue={tag?.colorToken || 'fern'}>{plantTagColors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <TextArea label="Description" name="description" defaultValue={tag?.description} wrapperClassName="md:col-span-4" />
    <label className="flex items-center gap-2 text-sm font-medium md:col-span-4"><input type="checkbox" name="publicVisible" defaultChecked={tag?.publicVisible} /> Visible on enabled public pages and exhibits</label>
  </>
}

export default async function PlantTagsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string }> }) {
  const { collection } = await requireCollectionGardener()
  const sp = await searchParams; const q = String(sp.q || '').trim(); const category = String(sp.category || '')
  const tags = await prisma.plantTag.findMany({
    where: { collectionId: collection.id, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}), ...(category ? { category } : {}) },
    include: { _count: { select: { definitions: true } } },
    orderBy: sp.sort === 'usage' ? [{ definitions: { _count: 'desc' } }, { name: 'asc' }] : [{ active: 'desc' }, { name: 'asc' }],
  })
  const allTags = await prisma.plantTag.findMany({ where: { collectionId: collection.id }, orderBy: { name: 'asc' } })
  return <div className="space-y-6">
    <div><h2 className="text-3xl font-bold">Plant Tags</h2><p className="mt-1 text-sm text-[var(--ax-muted)]">Reusable collection traits for browsing, acquisition planning, exhibits, and definition organization.</p></div>
    <AddPanel label="Create plant tag"><form action={savePlantTag} className="grid gap-3 md:grid-cols-4"><input type="hidden" name="collectionSlug" value={collection.slug} /><TagFields /><Button className="justify-self-start md:col-span-4">Create tag</Button></form></AddPanel>
    <Card><form className="grid gap-2 md:grid-cols-[minmax(0,1fr)_14rem_10rem_auto]"><input className={selectClass} name="q" placeholder="Search tags" defaultValue={q} /><select className={selectClass} name="category" defaultValue={category}><option value="">All categories</option>{plantTagCategories.map((item) => <option key={item} value={item}>{tagCategoryLabel(item)}</option>)}</select><select className={selectClass} name="sort" defaultValue={sp.sort || 'name'}><option value="name">Alphabetical</option><option value="usage">Most used</option></select><Button>Filter</Button></form></Card>
    <div className="grid gap-3 lg:grid-cols-2">{tags.map((tag) => <Card key={tag.id} className={!tag.active ? 'opacity-75' : ''}>
      <div className="flex items-start justify-between gap-3"><div><PlantTagChip tag={tag} compact={false} /><p className="mt-2 text-sm text-[var(--ax-muted)]">{tagCategoryLabel(tag.category)} · {tag._count.definitions} definition{tag._count.definitions === 1 ? '' : 's'} · {tag.publicVisible ? 'Public when enabled' : 'Private'}</p>{tag.description && <p className="mt-2 text-sm">{tag.description}</p>}</div><span className="text-xs font-semibold uppercase text-[var(--ax-muted)]">{tag.active ? 'Active' : 'Archived'}</span></div>
      <details className="mt-3 rounded-md border border-[color:var(--ax-border)] p-3"><summary className="cursor-pointer font-semibold">Edit</summary><form action={savePlantTag} className="mt-3 grid gap-3 md:grid-cols-4"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={tag.id} /><TagFields tag={tag} /><Button className="justify-self-start md:col-span-4">Save tag</Button></form></details>
      <form action={setPlantTagActive} className="mt-3"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={tag.id} /><input type="hidden" name="active" value={String(!tag.active)} /><Button className="bg-[var(--ax-surface-muted)] text-[var(--ax-heading)] hover:bg-[var(--ax-primary-wash)]">{tag.active ? 'Archive' : 'Restore'}</Button></form>
    </Card>)}</div>
    {allTags.length > 1 && <Card><h3 className="font-serif text-xl font-semibold">Merge duplicates</h3><p className="mt-1 text-sm text-[var(--ax-muted)]">Assignments move to the canonical tag; duplicate assignments are reconciled and the duplicate tag is archived.</p><form action={mergePlantTags} className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]"><input type="hidden" name="collectionSlug" value={collection.slug} /><select className={selectClass} name="duplicateId" required defaultValue=""><option value="">Duplicate tag</option>{allTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><select className={selectClass} name="canonicalId" required defaultValue=""><option value="">Keep canonical tag</option>{allTags.filter((tag) => tag.active).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><Button>Merge</Button></form></Card>}
  </div>
}
