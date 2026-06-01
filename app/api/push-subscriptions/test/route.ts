import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { sendPushNotification } from '@/lib/push'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const result = await sendPushNotification(user.id, {
    title: 'AxilDB test notification',
    body: 'Push notifications are enabled.',
    url: '/account',
  })

  return NextResponse.json(result)
}
