import Link from 'next/link'
import { requireServerAdmin } from '@/lib/auth'
import { deploymentAgentConfigured } from '@/lib/deployment-agent'
import { applicationRevision } from '@/lib/application-revision'
import { ApplicationUpdates } from '@/components/ApplicationUpdates'
import packageInfo from '@/package.json'
export default async function ApplicationUpdatesPage() {
  await requireServerAdmin()
  return (
    <div className="space-y-5">
      <Link className="underline" href="/server">
        Server Management
      </Link>
      <h1 className="text-3xl font-bold">Application Updates</h1>
      <p>
        AxilDB deployment management · Package {packageInfo.version} · Running
        image revision: {await applicationRevision()}
      </p>
      <ApplicationUpdates configured={deploymentAgentConfigured()} />
    </div>
  )
}
