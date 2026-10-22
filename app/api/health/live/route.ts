import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
// Liveness is intentionally independent of the database; /ready retains SELECT 1.
export async function GET() { return NextResponse.json({ status: 'alive' }, { headers: { 'Cache-Control': 'no-store' } }) }
