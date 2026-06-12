import Link from 'next/link'
import { addServerIncidentNote, resolveServerIncident, updateServerIncident } from '@/app/server-actions'
import { MetricChart } from '@/components/MetricChart'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatIncidentDuration, incidentCategories, incidentLabel, incidentSeverities } from '@/lib/server-incidents'
import { serverMetricHistory } from '@/lib/server-metrics'
import { formatDateTime } from '@/lib/time'

function inputDateTime(value?: Date | null) {
  if (!value) return ''
  return value.toISOString().slice(0, 16)
}

function metricValue(snapshot: any, metricType?: string | null) {
  if (metricType === 'memory') {
    const total = snapshot.metrics.memory.systemTotalBytes
    return total ? ((total - snapshot.metrics.memory.systemFreeBytes) / total) * 100 : 0
  }
  if (metricType === 'disk') {
    return snapshot.metrics.disk.totalBytes ? (snapshot.metrics.disk.usedBytes / snapshot.metrics.disk.totalBytes) * 100 : 0
  }
  return 0
}

function storedMetricPoints(metadata: unknown) {
  const value = metadata as { metricSamples?: Array<{ at?: string; value?: number }>; resolutionMetricSamples?: Array<{ at?: string; value?: number }> } | null
  const samples = [...(value?.metricSamples || []), ...(value?.resolutionMetricSamples || [])]
  return samples
    .map((sample) => ({ at: sample.at ? new Date(sample.at) : null, value: Number(sample.value) }))
    .filter((sample): sample is { at: Date; value: number } => Boolean(sample.at && !Number.isNaN(sample.at.getTime()) && Number.isFinite(sample.value)))
}

export default async function ServerIncidentDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireServerAdmin()
  const { id } = await params
  const [preferences, incident] = await Promise.all([
    prisma.emailPreference.findUnique({ where: { userId: admin.id } }),
    prisma.serverIncident.findUniqueOrThrow({
      where: { id },
      include: {
        createdBy: { select: { email: true } },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { email: true } } } },
        notifications: { orderBy: { sentAt: 'desc' }, include: { user: { select: { email: true } } } },
      },
    }),
  ])
  const history = incident.metricType ? await serverMetricHistory() : []
  const liveChartPoints = history
    .filter((snapshot) => snapshot.capturedAt >= new Date(incident.detectedAt.getTime() - 60 * 60 * 1000) && snapshot.capturedAt <= new Date((incident.resolvedAt || new Date()).getTime() + 60 * 60 * 1000))
    .map((snapshot) => ({ at: snapshot.capturedAt, value: metricValue(snapshot, incident.metricType) }))
  const chartPoints = liveChartPoints.length ? liveChartPoints : storedMetricPoints(incident.metadata)

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-medium text-[#2f6b45] underline" href="/server/incidents">Incident History</Link>
        <h2 className="mt-2 text-3xl font-bold">{incident.title}</h2>
        <p className="mt-1 text-sm text-stone-600">
          {incidentLabel(incident.category)} · {incidentLabel(incident.severity)} · {incidentLabel(incident.status)}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><p className="text-sm text-stone-600">Opened</p><p className="mt-2 font-semibold">{formatDateTime(incident.detectedAt, preferences?.timezone)}</p></Card>
        <Card><p className="text-sm text-stone-600">Resolved</p><p className="mt-2 font-semibold">{incident.resolvedAt ? formatDateTime(incident.resolvedAt, preferences?.timezone) : 'Open'}</p></Card>
        <Card><p className="text-sm text-stone-600">Duration</p><p className="mt-2 font-semibold">{formatIncidentDuration(incident.durationSeconds)}</p></Card>
        <Card><p className="text-sm text-stone-600">Peak</p><p className="mt-2 font-semibold">{incident.peakValue != null ? `${incident.peakValue.toFixed(1)}${incident.metricType ? '%' : ''}` : '—'}</p></Card>
      </div>

      {incident.description && <Card><p className="text-sm leading-6 text-stone-700">{incident.description}</p></Card>}

      {incident.metricType && (
        <MetricChart
          title={`${incident.metricType} incident`}
          value={incident.observedValue != null ? `${incident.observedValue.toFixed(1)}%` : '—'}
          subtitle={`Threshold ${incident.thresholdValue ?? '—'}%`}
          points={chartPoints}
          markers={[
            { at: incident.detectedAt, label: incident.title, severity: incident.severity, status: 'OPEN', tooltip: `Opened ${formatDateTime(incident.detectedAt, preferences?.timezone)}` },
            ...(incident.resolvedAt ? [{ at: incident.resolvedAt, label: `${incident.title} resolved`, severity: incident.severity, status: 'RESOLVED', tooltip: `Resolved ${formatDateTime(incident.resolvedAt, preferences?.timezone)}` }] : []),
          ]}
        />
      )}

      <Card>
        <h3 className="font-serif text-xl font-semibold">Edit incident</h3>
        <form action={updateServerIncident} className="mt-4 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="id" value={incident.id} />
          <Field label="Title" name="title" defaultValue={incident.title} required wrapperClassName="md:col-span-2" />
          <Select label="Category" name="category" defaultValue={incident.category}>
            {incidentCategories.map((category) => <option key={category}>{category}</option>)}
          </Select>
          <Select label="Severity" name="severity" defaultValue={incident.severity}>
            {incidentSeverities.map((severity) => <option key={severity}>{severity}</option>)}
          </Select>
          <Field label="Opened" name="detectedAt" type="datetime-local" defaultValue={inputDateTime(incident.detectedAt)} />
          <Select label="Status" name="status" defaultValue={incident.status}>
            <option>OPEN</option>
            <option>RESOLVED</option>
          </Select>
          <Field label="Resolved" name="resolvedAt" type="datetime-local" defaultValue={inputDateTime(incident.resolvedAt)} />
          <TextArea label="Description" name="description" defaultValue={incident.description || ''} wrapperClassName="md:col-span-2" />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button>Save incident</Button>
          </div>
        </form>
        {incident.status === 'OPEN' && (
          <form action={resolveServerIncident} className="mt-3">
            <input type="hidden" name="id" value={incident.id} />
            <Button className="bg-[#4f7f55] hover:bg-[#426d48]">Resolve now</Button>
          </form>
        )}
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Notes</h3>
        <form action={addServerIncidentNote} className="mt-4 grid gap-3">
          <input type="hidden" name="incidentId" value={incident.id} />
          <TextArea label="Add note" name="body" />
          <Button className="w-fit">Add note</Button>
        </form>
        <div className="mt-5 grid gap-3">
          {incident.notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-stone-200 bg-white/60 p-3">
              <p className="text-sm whitespace-pre-wrap">{note.body}</p>
              <p className="mt-2 text-xs text-stone-500">{formatDateTime(note.createdAt, preferences?.timezone)} · {note.author?.email || 'server admin'}</p>
            </div>
          ))}
          {incident.notes.length === 0 && <p className="text-sm text-stone-600">No notes yet.</p>}
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Notifications Sent</h3>
        <div className="mt-4 grid gap-2">
          {incident.notifications.map((notification) => (
            <div key={notification.id} className="grid gap-1 rounded-lg border border-stone-200 bg-white/60 p-3 text-sm md:grid-cols-[12rem_1fr_8rem_8rem]">
              <span>{formatDateTime(notification.sentAt, preferences?.timezone)}</span>
              <span>{notification.recipient || notification.user?.email || 'Server Admin'}</span>
              <span>{incidentLabel(notification.channel)}</span>
              <span>{incidentLabel(notification.status)}</span>
            </div>
          ))}
          {incident.notifications.length === 0 && <p className="text-sm text-stone-600">No notification records are attached to this incident.</p>}
        </div>
      </Card>
    </div>
  )
}
