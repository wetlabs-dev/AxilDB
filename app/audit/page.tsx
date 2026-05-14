import { Card } from '@/components/ui'
import { requireAdminUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function AuditLog() {
  await requireAdminUser()
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Audit Log</h2>
      <div className="grid gap-3">
        {logs.map((log) => (
          <Card key={log.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold">{log.action} · {log.entityType}</p>
                <p className="text-sm">{log.summary || log.entityId}</p>
              </div>
              <div className="text-right text-sm text-stone-600">
                <p>{log.createdAt.toLocaleString()}</p>
                <p>{log.userEmail || 'System'}{log.userRole ? ` · ${log.userRole}` : ''}</p>
              </div>
            </div>
            {log.metadata && <pre className="mt-3 overflow-auto rounded-lg bg-stone-100 p-3 text-xs">{log.metadata}</pre>}
          </Card>
        ))}
        {logs.length === 0 && <Card>No audit entries yet.</Card>}
      </div>
    </div>
  )
}
