import Link from 'next/link'
import { CollectionExhibitSubscriberStatus } from '@prisma/client'
import { audit } from '@/lib/auth'
import { hashExhibitToken, publicExhibitPath } from '@/lib/exhibits'
import { prisma } from '@/lib/prisma'

export default async function UnsubscribeExhibitPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams
  const token = String(params.token || '')
  let title = 'Subscription unavailable'
  let message = 'This unsubscribe link is missing or has already been used.'
  let href = '/collections'

  if (token) {
    const subscriber = await prisma.collectionExhibitSubscriber.findFirst({
      where: { unsubscribeTokenHash: hashExhibitToken(token) },
      include: { exhibit: true },
    })
    if (subscriber) {
      await prisma.collectionExhibitSubscriber.update({
        where: { id: subscriber.id },
        data: {
          status: CollectionExhibitSubscriberStatus.UNSUBSCRIBED,
          unsubscribedAt: new Date(),
          unsubscribeTokenHash: hashExhibitToken(`${token}:${Date.now()}`),
        },
      })
      await audit(null, 'UNSUBSCRIBE', 'COLLECTION_EXHIBIT_SUBSCRIBER', subscriber.id, `Unsubscribed from exhibit ${subscriber.exhibit.title}`, undefined, subscriber.exhibit.collectionId)
      title = 'You are unsubscribed'
      message = `${subscriber.email} will no longer receive updates for ${subscriber.exhibit.title}.`
      href = publicExhibitPath(subscriber.exhibit)
    }
  }

  return (
    <main className="ax-public-light min-h-screen bg-[#f8f3e6] px-4 py-10 text-stone-900">
      <section className="mx-auto grid max-w-xl gap-4 rounded-lg border border-stone-200 bg-white/85 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#2f6b45]">Collection exhibit</p>
        <h1 className="font-serif text-3xl font-semibold">{title}</h1>
        <p className="text-stone-700">{message}</p>
        <Link className="inline-flex w-fit rounded-md bg-[#2f6b45] px-4 py-2 text-sm font-medium text-white" href={href}>
          Return to exhibit
        </Link>
      </section>
    </main>
  )
}
