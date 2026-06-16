import Link from 'next/link'
import { CollectionExhibitView } from '@/components/exhibits/CollectionExhibitView'
import { isPublishedExhibitVisible, loadExhibitForDisplay } from '@/lib/exhibits'
import { prisma } from '@/lib/prisma'

function Unavailable() {
  return (
    <main className="min-h-screen bg-[#f8f3e6] px-4 py-10 text-stone-900">
      <section className="mx-auto grid max-w-xl gap-4 rounded-lg border border-stone-200 bg-white/85 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#2f6b45]">Collection exhibit</p>
        <h1 className="font-serif text-3xl font-semibold">This exhibit is not available.</h1>
        <p className="text-stone-700">It may be private, expired, unpublished, or the share link may be incomplete.</p>
        <Link className="inline-flex w-fit rounded-md bg-[#2f6b45] px-4 py-2 text-sm font-medium text-white" href="/collections">
          Go to collections
        </Link>
      </section>
    </main>
  )
}

export default async function PublicExhibitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { slug } = await params
  const query = await searchParams
  const data = await loadExhibitForDisplay(prisma, decodeURIComponent(slug))
  if (!data || !isPublishedExhibitVisible(data.exhibit, query.token || null)) return <Unavailable />
  return <CollectionExhibitView data={data} token={query.token || null} />
}
