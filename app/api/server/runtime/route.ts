import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { isServerAdminRole } from '@/lib/roles'
import { runtimeDiagnostics } from '@/lib/runtime-diagnostics'
export const dynamic = 'force-dynamic'
export async function GET() {
  const user = await getCurrentUser()
  if (!user || !isServerAdminRole(user.role)) return NextResponse.json({ error: 'Server administrator permission required.' }, { status: 403 })
  return NextResponse.json(runtimeDiagnostics(), { headers: { 'Cache-Control': 'private, no-store' } })
}
