import { updateAccount } from '@/app/auth-actions'
import { Card, Field, Button } from '@/components/ui'
import { requireUser } from '@/lib/auth'

export default async function Account() {
  const user = await requireUser()

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Account</h2>
      <Card>
        <form action={updateAccount} className="grid max-w-2xl gap-x-3 gap-y-2 md:grid-cols-2">
          <Field label="Email" name="email" type="email" required defaultValue={user.email} />
          <Field label="New password" name="password" type="password" />
          <Button className="justify-self-start md:col-span-2">Save account settings</Button>
        </form>
      </Card>
    </div>
  )
}
