import { prisma } from '@/lib/prisma'
import { requestCadenceCalibration } from '@/app/calibration-actions'
import { plantName } from '@/lib/utils'
export async function CalibrationOverview() {
  const [counts,states]=await Promise.all([
    prisma.metricCalibrationState.groupBy({by:['outcome'],_count:{_all:true}}),
    prisma.metricCalibrationState.findMany({include:{plantDefinition:true,collection:{select:{name:true,slug:true}}},orderBy:{updatedAt:'desc'},take:30}),
  ])
  return <details className="rounded border p-3"><summary>Cadence calibration · outcomes and priority research</summary>
    <p>Evaluates recorded care history; suggestions require approval. Bounded background discovery follows global and collection Curator enablement.</p>
    <p>{counts.map(c=>`${c.outcome.replaceAll('_',' ').toLowerCase()}: ${c._count._all}`).join(' · ') || 'Definitions will be discovered gradually by the existing worker.'}</p>
    <ul className="mt-2 space-y-2">{states.map(s=><li key={s.id} className="rounded border p-2 text-sm">
      {s.collection.name} · {plantName(s.plantDefinition)} · {s.metricKey.slice(5).replaceAll('_',' ')} · {s.outcome.replaceAll('_',' ').toLowerCase()}
      <p>Next assessment: {s.nextEligibleAt?.toISOString().slice(0,10) || 'Awaiting resolution or eligibility change'}</p>
      <form action={async fd=>{'use server';await requestCadenceCalibration(fd)}}><input type="hidden" name="collectionSlug" value={s.collection.slug}/><input type="hidden" name="definitionId" value={s.plantDefinitionId}/><input type="hidden" name="activity" value={s.metricKey.slice(5)}/><button className="rounded border px-2 py-1">Prioritize reassessment</button></form>
    </li>)}</ul>
  </details>
}
