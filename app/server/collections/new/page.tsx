import { createCollection } from '@/app/collection-actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'

export default async function NewServerCollectionPage() {
  await requireServerAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">New Collection</h2>
        <p className="mt-1 text-sm text-stone-600">Server admins can create collection workspaces and assign collection managers after creation.</p>
      </div>

      <Card>
        <form action={createCollection} className="grid max-w-3xl gap-3 md:grid-cols-2">
          <Field label="Name" name="name" required />
          <Field label="Slug" name="slug" help="Used in URLs. Leave blank to generate one from the collection name." />
          <Select label="Visibility" name="visibility" defaultValue="PRIVATE">
            <option value="PRIVATE">Private</option>
            <option value="PUBLIC">Public</option>
          </Select>
          <TextArea label="Description" name="description" wrapperClassName="md:col-span-2" />
          <Button className="justify-self-start md:col-span-2">Create collection</Button>
        </form>
      </Card>
    </div>
  )
}
