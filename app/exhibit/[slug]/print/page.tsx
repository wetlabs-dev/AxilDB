import { CollectionExhibitView } from '@/components/exhibits/CollectionExhibitView'
import { isPublishedExhibitVisible, loadExhibitForDisplay } from '@/lib/exhibits'
import { prisma } from '@/lib/prisma'

export default async function PrintableExhibitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { slug } = await params
  const query = await searchParams
  const data = await loadExhibitForDisplay(prisma, decodeURIComponent(slug))
  if (!data || !isPublishedExhibitVisible(data.exhibit, query.token || null)) {
    return <main className="p-8">This exhibit is not available.</main>
  }
  return <CollectionExhibitView data={data} token={query.token || null} print />
}
