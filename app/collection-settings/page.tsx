import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { requireCollectionOwner } from '@/lib/collections'

export default async function CollectionSettingsPage() {
  const { collection } = await requireCollectionOwner()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Collection Settings</h2>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Manage this collection&apos;s name, URL slug, description, and whether visitors can browse it without joining.
        </p>
      </div>

      <Card>
        <form action="/api/collections/update" method="post" className="grid max-w-4xl gap-x-3 gap-y-3 lg:grid-cols-3">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Field label="Name" name="name" defaultValue={collection.name} required />
          <Field label="Slug" name="slug" defaultValue={collection.slug} required />
          <Select label="Visibility" name="visibility" defaultValue={collection.visibility}>
            <option value="PRIVATE">Private</option>
            <option value="PUBLIC">Public</option>
          </Select>
          <TextArea label="Description" name="description" defaultValue={collection.description} wrapperClassName="lg:col-span-3" />
          <div className="lg:col-span-3">
            <Button>Save collection settings</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
