import { redirect } from 'next/navigation'

export default async function NewCollectionPage() {
  redirect('/server/collections/new')
}
