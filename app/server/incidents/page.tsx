import Link from 'next/link'
import { createManualServerIncident } from '@/app/server-actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatIncidentDuration, incidentCategories, incidentLabel, incidentSeverities } from '@/lib/server-incidents'
import { formatDateTime } from '@/lib/time'

function dateInput(value?: Date | null) {
  if (!value) return ''
  return value.toISOString().slice(0, 10)
}

function severityClass(severity: string) {
  if (severity === 'CRITICAL') return 'border-red-200 bg-red-50 text-red-900'
  if (severity === 'WARNING') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-stone-200 bg-stone-50 text-stone-700'
}

function statusClass(status: string) {
  return status === 'OPEN' ? 'border-[#d6a533] bg-[#fff8d8] text-[#6f5400]' : 'border-green-200 bg-green-50 text-green-900'
}

export default async function ServerIncidentHistory({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; category?: string; from?: string; to?: string; q?: string }>
}) {
  const admin = await requireServerAdmin()
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: admin.id } })
  const params = await searchParams
  const where: any = {}
  if (params.status === 'OPEN' || params.status === 'RESOLVED') where.status = params.status
  if (params.severity && incidentSeverities.includes(params.severity as any)) where.severity = params.severity
  if (params.category && incidentCategories.includes(params.category as any)) where.category = params.category
  if (params.q?.trim()) {
    where.OR = [
      { title: { contains: params.q.trim(), mode: 'insensitive' } },
      { description: { contains: params.q.trim(), mode: 'insensitive' } },
      { type: { contains: params.q.trim(), mode: 'insensitive' } },
    ]
  }
  if (params.from || params.to) {
    where.detectedAt = {
      ...(params.from ? { gte: new Date(`${params.from}T00:00:00`) } : {}),
      ...(params.to ? { lte: new Date(`${params.to}T23:59:59`) } : {}),
    }
  }

  const incidents = await prisma.serverIncident.findMany({
    where,
    orderBy: { detectedAt: 'desc' },
    take: 200,
    include: { notifications: true, _count: { select: { notes: true } } },
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Incident History</h2>
          <p className="mt-1 text-sm text-stone-600">A quiet operational logbook for server health events, manual notes, and resolved incidents.</p>
        </div>
        <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-white" href="/server">Server Management</Link>
      </div>

      <Card>
        <form className="grid gap-3 md:grid-cols-6">
          <Field label="Search" name="q" defaultValue={params.q || ''} wrapperClassName="md:col-span-2" />
          <Select label="Status" name="status" defaultValue={params.status || ''}>
            <option value="">Any</option>
            <option value="OPEN">Open only</option>
            <option value="RESOLVED">Resolved only</option>
          </Select>
          <Select label="Severity" name="severity" defaultValue={params.severity || ''}>
            <option value="">Any</option>
            {incidentSeverities.map((severity) => <option key={severity}>{severity}</option>)}
          </Select>
          <Select label="Category" name="category" defaultValue={params.category || ''}>
            <option value="">Any</option>
            {incidentCategories.map((category) => <option key={category}>{category}</option>)}
          </Select>
          <Field label="From" name="from" type="date" defaultValue={params.from || ''} />
          <Field label="To" name="to" type="date" defaultValue={params.to || ''} />
          <div className="flex items-end gap-2">
            <Button className="w-full">Filter</Button>
          </div>
        </form>
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer list-none font-serif text-xl font-semibold">Create manual incident</summary>
          <form action={createManualServerIncident} className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Title" name="title" required wrapperClassName="md:col-span-2" />
            <Select label="Category" name="category" defaultValue="MANUAL">
              {incidentCategories.map((category) => <option key={category}>{category}</option>)}
            </Select>
            <Select label="Severity" name="severity" defaultValue="INFO">
              {incidentSeverities.map((severity) => <option key={severity}>{severity}</option>)}
            </Select>
            <Field label="Opened" name="detectedAt" type="datetime-local" />
            <Select label="Status" name="status" defaultValue="OPEN">
              <option>OPEN</option>
              <option>RESOLVED</option>
            </Select>
            <TextArea label="Description" name="description" wrapperClassName="md:col-span-2" />
            <Button className="w-fit md:col-span-2">Create incident</Button>
          </form>
        </details>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-stone-200 bg-[#f5f0e2] text-xs uppercase tracking-[0.12em] text-stone-600">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Resolved</th>
                <th className="px-4 py-3">Duration</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id} className="border-b border-stone-200/70 last:border-0">
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(incident.status)}`}>{incidentLabel(incident.status)}</span></td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityClass(incident.severity)}`}>{incidentLabel(incident.severity)}</span></td>
                  <td className="px-4 py-3">{incidentLabel(incident.category)}</td>
                  <td className="px-4 py-3">
                    <Link className="font-semibold text-[#2f6b45] underline" href={`/server/incidents/${incident.id}`}>{incident.title}</Link>
                    <p className="mt-1 text-xs text-stone-500">{incident._count.notes} note{incident._count.notes === 1 ? '' : 's'} · {incident.notifications.length} notification{incident.notifications.length === 1 ? '' : 's'}</p>
                  </td>
                  <td className="px-4 py-3">{formatDateTime(incident.detectedAt, preferences?.timezone)}</td>
                  <td className="px-4 py-3">{incident.resolvedAt ? formatDateTime(incident.resolvedAt, preferences?.timezone) : '—'}</td>
                  <td className="px-4 py-3">{formatIncidentDuration(incident.durationSeconds)}</td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-stone-600" colSpan={7}>No incidents match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
