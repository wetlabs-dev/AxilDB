import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { manageRepottingWindow } from '@/app/repotting-actions'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { windowRange } from '@/lib/repotting-windows'
function WindowForm({ window: w }: { window?: any }) {
  return (
    <form action={manageRepottingWindow} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={w?.id || ''} />
      <Field name="name" label="Name" defaultValue={w?.name} required />
      <Field
        name="sortOrder"
        label="Order"
        type="number"
        defaultValue={w?.sortOrder || 0}
      />
      {['startMonth', 'startDay', 'endMonth', 'endDay'].map((k) => (
        <Field
          key={k}
          name={k}
          label={k.replace(/([A-Z])/g, ' $1')}
          type="number"
          min="1"
          max={k.includes('Month') ? '12' : '31'}
          defaultValue={w?.[k] || 1}
          required
        />
      ))}
      <TextArea
        name="description"
        label="Description"
        defaultValue={w?.description}
      />
      <label>
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={w?.isActive ?? true}
        />{' '}
        Active
      </label>
      <Button name="action" value="SAVE">
        Save window
      </Button>
      {w && !Object.values(w._count).some(Boolean) && (
        <Button name="action" value="DELETE">
          Delete unused window
        </Button>
      )}
    </form>
  )
}
export default async function Page() {
  await requireServerAdmin()
  const windows = await prisma.repottingWindow.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: {
          primaryDefinitions: true,
          alternateDefinitions: true,
          queueItems: true,
        },
      },
    },
  })
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Repotting Windows</h1>
      <p>
        Editable annual periods. Defaults describe a temperate Northern
        Hemisphere calendar, not universal growing conditions. Changes update
        existing bookings’ dates while preserving their assigned year.
        Reschedule active bookings before deactivation.
      </p>
      <Card>
        <details>
          <summary>Create window</summary>
          <WindowForm />
        </details>
      </Card>
      {windows.map((w) => (
        <Card key={w.id}>
          <h2 className="font-semibold">
            {w.name} · {windowRange(w)} · {w.isActive ? 'Active' : 'Inactive'}
          </h2>
          <p>
            {w._count.primaryDefinitions + w._count.alternateDefinitions}{' '}
            definitions · {w._count.queueItems} retained queue entries
          </p>
          <details>
            <summary>Edit</summary>
            <WindowForm window={w} />
          </details>
        </Card>
      ))}
    </div>
  )
}
