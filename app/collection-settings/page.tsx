import { requestAiAccess } from '@/app/collection-actions'
import { createQuietDay, deleteQuietDay, updateQuietDayShiftRule } from '@/app/care-schedule-actions'
import { Button, Card, DangerButton, Field, Select, TextArea } from '@/components/ui'
import { requireCollectionManager } from '@/lib/collections'
import { careScheduleLabel, ensureQuietDayShiftRules, schedulableCareTypes } from '@/lib/care-scheduling'
import { prisma } from '@/lib/prisma'
import { formatDate, timeZoneForPreference } from '@/lib/time'
import { normalizeWishlistPublicSettings, wishlistPublicSettingLabels } from '@/lib/wishlist'

function quietDaySummary(quietDay: {
  quietType: string
  date: Date | null
  startDate: Date | null
  endDate: Date | null
  dayOfWeek: number | null
  timezone: string
}) {
  if (quietDay.quietType === 'ONE_TIME' && quietDay.date) return formatDate(quietDay.date, quietDay.timezone)
  if (quietDay.quietType === 'DATE_RANGE' && quietDay.startDate && quietDay.endDate) {
    return `${formatDate(quietDay.startDate, quietDay.timezone)} through ${formatDate(quietDay.endDate, quietDay.timezone)}`
  }
  if (quietDay.quietType === 'WEEKLY_RECURRING' && quietDay.dayOfWeek !== null) {
    return `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][quietDay.dayOfWeek] || 'week'}`
  }
  return 'Schedule needs details'
}

export default async function CollectionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aiAccess?: string; quiet?: string }>
}) {
  const { collection, user } = await requireCollectionManager()
  const sp = await searchParams
  await ensureQuietDayShiftRules(prisma, collection.id)
  const [pendingAiRequest, quietDays, quietRules, preferences] = await Promise.all([
    prisma.aiAccessRequest.findFirst({
      where: { collectionId: collection.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, rationale: true },
    }),
    prisma.collectionQuietDay.findMany({
      where: { collectionId: collection.id },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.collectionQuietDayShiftRule.findMany({
      where: { collectionId: collection.id },
      orderBy: { careType: 'asc' },
    }),
    prisma.emailPreference.findUnique({ where: { userId: user.id } }),
  ])
  const timezone = timeZoneForPreference(preferences)
  const quietRuleByType = new Map(quietRules.map((rule) => [rule.careType, rule]))
  const wishlistSettings = normalizeWishlistPublicSettings(collection.wishlistPublicSettingsJson)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Collection Settings</h2>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Manage this collection&apos;s name, URL slug, description, and whether visitors can browse it without joining.
        </p>
      </div>

      <Card>
        <form id="collection-settings-form" action="/api/collections/update" method="post" className="grid max-w-4xl gap-x-3 gap-y-3 lg:grid-cols-3">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Field label="Name" name="name" defaultValue={collection.name} required />
          <Field label="Slug" name="slug" defaultValue={collection.slug} required />
          <Select label="Visibility" name="visibility" defaultValue={collection.visibility}>
            <option value="PRIVATE">Private</option>
            <option value="PUBLIC">Public</option>
          </Select>
          <Select label="Acquisition visibility" name="acquisitionVisibility" defaultValue={(collection as any).acquisitionVisibility || 'PRIVATE'}>
            <option value="PRIVATE">Private</option>
            <option value="MEMBERS">Collection members</option>
            <option value="PUBLIC">Public when collection is public</option>
          </Select>
          <TextArea label="Description" name="description" defaultValue={collection.description} wrapperClassName="lg:col-span-3" />
          <TextArea label="Public wishlist introduction" name="wishlistIntro" defaultValue={collection.wishlistIntro} wrapperClassName="lg:col-span-3" />
          <fieldset className="grid gap-2 rounded-lg border border-stone-200 bg-white/45 p-3 lg:col-span-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">Public wishlist fields</legend>
            {wishlistPublicSettingLabels.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={key} defaultChecked={wishlistSettings[key]} />
                {label}
              </label>
            ))}
            <p className="text-xs text-stone-600 sm:col-span-2">Exact locations, maximum price, private notes, and non-public observations are never shown.</p>
          </fieldset>
          <div className="lg:col-span-3">
            <Button>Save collection settings</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">AI features</h3>
            <p className="mt-1 text-sm text-stone-600">
              AI draft, Magic Fill, Green Thumb, and Collection Briefing tools are controlled by the server admin because they use metered API calls.
            </p>
          </div>
          <span className={collection.aiFeaturesEnabled ? 'rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-semibold text-green-900' : 'rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-sm font-semibold text-stone-700'}>
            {collection.aiFeaturesEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        {sp.aiAccess === 'requested' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">AI access request sent to the server admin.</p>}
        {sp.aiAccess === 'already-pending' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This collection already has a pending AI access request.</p>}
        {sp.aiAccess === 'already-enabled' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">AI features are already enabled for this collection.</p>}
        {!collection.aiFeaturesEnabled && (
          <div className="mt-4">
            {pendingAiRequest ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                AI access was requested on {formatDate(pendingAiRequest.createdAt)} and is awaiting server admin review.
              </p>
            ) : (
              <form action={requestAiAccess} className="grid max-w-2xl gap-3">
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <TextArea label="Why does this collection need AI features?" name="rationale" className="min-h-24" />
                <Button className="w-fit">Request AI access</Button>
              </form>
            )}
          </div>
        )}
        <div className="mt-4 rounded-lg border border-stone-200 bg-white/50 p-3">
          <label className={`flex items-start gap-2 text-sm ${collection.aiFeaturesEnabled ? 'text-stone-800' : 'text-stone-500'}`}>
            <input
              type="checkbox"
              name="aiBriefingEnabled"
              form="collection-settings-form"
              defaultChecked={collection.aiFeaturesEnabled && collection.aiBriefingEnabled}
              disabled={!collection.aiFeaturesEnabled}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Enable daily Collection Briefing</span>
              <span className="block text-stone-600">
                Show one cached AI-generated or fallback collection briefing per local day on the dashboard. This option is available only while server-level AI features are enabled.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Quiet Days</h3>
            <p className="mt-1 max-w-3xl text-sm text-stone-600">
              Define collection-level days when routine care should not be scheduled. Care Queue and Care Schedule Sync shift affected due dates using the rules below.
            </p>
          </div>
          <span className="rounded-full border border-[#c7d8bd] bg-[#f5fbf0] px-3 py-1 text-sm font-semibold text-[#2f6b45]">
            {quietDays.filter((quietDay) => quietDay.active).length} active
          </span>
        </div>
        {sp.quiet === 'created' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Quiet day created.</p>}
        {sp.quiet === 'deleted' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Quiet day deleted.</p>}
        {sp.quiet === 'rule-updated' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Quiet-day shift rule updated.</p>}

        <div className="mt-4 grid gap-3">
          {quietDays.length === 0 ? (
            <p className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm text-stone-600">No quiet days have been defined yet.</p>
          ) : quietDays.map((quietDay) => (
            <div key={quietDay.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/55 p-3">
              <div>
                <p className="font-semibold">{quietDay.name}</p>
                <p className="text-sm text-stone-600">{quietDaySummary(quietDay)} · {quietDay.active ? 'active' : 'inactive'}</p>
                {quietDay.description && <p className="mt-1 text-sm text-stone-600">{quietDay.description}</p>}
              </div>
              <form action={deleteQuietDay}>
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="quietDayId" value={quietDay.id} />
                <DangerButton className="px-3 py-1.5">Delete</DangerButton>
              </form>
            </div>
          ))}
        </div>

        <form action={createQuietDay} className="mt-5 grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 lg:grid-cols-3">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Field label="Name" name="name" required />
          <Select label="Quiet day type" name="quietType" defaultValue="ONE_TIME">
            <option value="ONE_TIME">One-time date</option>
            <option value="WEEKLY_RECURRING">Weekly recurring</option>
            <option value="DATE_RANGE">Date range</option>
          </Select>
          <Field label="Timezone" name="timezone" defaultValue={timezone} />
          <Field label="One-time date" name="date" type="date" />
          <Field label="Range start" name="startDate" type="date" />
          <Field label="Range end" name="endDate" type="date" />
          <Select label="Weekly day" name="dayOfWeek" defaultValue="0">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}
          </Select>
          <TextArea label="Description" name="description" wrapperClassName="lg:col-span-2" />
          <label className="flex items-center gap-2 text-sm">
            <input type="hidden" name="active" value="off" />
            <input type="checkbox" name="active" value="on" defaultChecked />
            Active
          </label>
          <div className="lg:col-span-3">
            <Button>Create quiet day</Button>
          </div>
        </form>

        <div className="mt-5">
          <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-500">Shift rules</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {schedulableCareTypes.map((careType) => {
              const rule = quietRuleByType.get(careType)
              return (
                <form key={careType} action={updateQuietDayShiftRule} className="grid gap-3 rounded-lg border border-stone-200 bg-white/55 p-3 sm:grid-cols-2">
                  <input type="hidden" name="collectionSlug" value={collection.slug} />
                  <input type="hidden" name="careType" value={careType} />
                  <p className="font-semibold sm:col-span-2">{careScheduleLabel(careType)}</p>
                  <Select label="Default shift" name="defaultShiftDirection" defaultValue={rule?.defaultShiftDirection || 'LATER'}>
                    <option value="EARLIER">Earlier</option>
                    <option value="LATER">Later</option>
                    <option value="SMART">Smart</option>
                  </Select>
                  <Field label="Max days before" name="maxShiftDaysBefore" type="number" min="0" max="14" defaultValue={rule?.maxShiftDaysBefore ?? 2} />
                  <Field label="Max days after" name="maxShiftDaysAfter" type="number" min="0" max="14" defaultValue={rule?.maxShiftDaysAfter ?? 2} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="hidden" name="active" value="off" />
                    <input type="checkbox" name="active" value="on" defaultChecked={rule?.active ?? true} />
                    Active
                  </label>
                  <div className="sm:col-span-2">
                    <Button className="px-3 py-1.5">Save rule</Button>
                  </div>
                </form>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}
