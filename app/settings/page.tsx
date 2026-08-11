import { redirect } from 'next/navigation'
import { collectionPath, requireCollectionAdmin } from '@/lib/collections'

export default async function LegacyAuthoritySettings() {
  const { collection } = await requireCollectionAdmin()
  redirect(collectionPath(collection.slug, '/taxonomic-authorities'))
}
