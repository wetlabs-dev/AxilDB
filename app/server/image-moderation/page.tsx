import { resolveImageModerationReview } from '@/app/actions'
import { ModeratedImagePlaceholder } from '@/components/PlantImage'
import { Button, Card, LinkButton } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/time'

export default async function ImageModerationQueue() {
  const admin = await requireServerAdmin()
  const [preferences, reviews] = await Promise.all([
    prisma.emailPreference.findUnique({ where: { userId: admin.id } }),
    prisma.imageModerationReview.findMany({
      where: { reviewType: 'NSFW', status: 'PENDING' },
      include: {
        photo: true,
        collection: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const timezone = preferences?.timezone

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Image Moderation</h2>
          <p className="mt-1 text-sm text-stone-600">Review images automatically hidden by AxilDB before they appear to normal users or public visitors.</p>
        </div>
        <LinkButton href="/server">Server Management</LinkButton>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Pending hidden-image reviews</h3>
            <p className="mt-1 text-sm text-stone-600">Flagged images stay censored unless a server admin overrides the result.</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">{reviews.length} pending</span>
        </div>

        <div className="mt-4 grid gap-3">
          {reviews.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No image moderation reviews are pending.</p>}
          {reviews.map((review) => (
            <div key={review.id} className="grid gap-3 rounded-lg border border-stone-200 bg-white/55 p-3 lg:grid-cols-[9rem_minmax(0,1fr)]">
              <div className="aspect-square overflow-hidden rounded-lg border border-stone-200">
                <ModeratedImagePlaceholder status={review.photo.moderationStatus} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-serif text-lg font-semibold">{review.collection?.name || 'Deleted collection'}</h4>
                    <p className="text-sm text-stone-600">
                      Photo {review.photoId} · created {formatDateTime(review.createdAt, timezone)}
                    </p>
                  </div>
                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-900">Hidden</span>
                </div>
                {review.reason && <p className="mt-2 rounded-lg border border-red-100 bg-red-50/80 p-2 text-sm text-red-950">{review.reason}</p>}
                <p className="mt-2 text-xs text-stone-500">
                  Model: {review.model || review.photo.moderationModel || 'not recorded'} · Uploader account {review.uploaderUserId ? 'recorded' : 'not recorded'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={resolveImageModerationReview}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="action" value="OVERRIDE_FALSE_ALARM" />
                    <input type="hidden" name="back" value="/server/image-moderation" />
                    <Button className="px-3 py-1.5 text-xs">False alarm: show image</Button>
                  </form>
                  <form action={resolveImageModerationReview}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="action" value="REMOVE" />
                    <input type="hidden" name="back" value="/server/image-moderation" />
                    <Button className="bg-[#9a3f35] px-3 py-1.5 text-xs hover:bg-[#7d3028]">Remove image</Button>
                  </form>
                  <form action={resolveImageModerationReview}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="action" value="REMOVE_AND_BLOCK_USER" />
                    <input type="hidden" name="back" value="/server/image-moderation" />
                    <Button className="bg-[#6f2c26] px-3 py-1.5 text-xs hover:bg-[#5b221e]">Remove and block uploader</Button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
