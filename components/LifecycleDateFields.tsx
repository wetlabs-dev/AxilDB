'use client'

import { Field } from '@/components/ui'
import { lifecycleDateFields } from '@/lib/plant-instance-types'
import { useEffect, useState } from 'react'

export function LifecycleDateFields({
  defaultValues = {},
  includeAcquisitionDate = true,
}: {
  defaultValues?: Record<string, string | null | undefined>
  includeAcquisitionDate?: boolean
}) {
  const [instanceType, setInstanceType] = useState('MOTHER')

  useEffect(() => {
    const rootSelect = document.querySelector('select[name="instanceType"]') as HTMLSelectElement | null
    const form = rootSelect?.form
    const select = form?.querySelector('select[name="instanceType"]') as HTMLSelectElement | null
    if (!select) return
    const sync = () => setInstanceType(select.value || 'MOTHER')
    sync()
    select.addEventListener('change', sync)
    return () => select.removeEventListener('change', sync)
  }, [])

  return (
    <>
      {lifecycleDateFields
        .filter((field) => includeAcquisitionDate || field.name !== 'acquisitionDate')
        .filter((field) => (field.types as readonly string[]).includes(instanceType))
        .map((field) => (
          <Field
            key={field.name}
            label={field.label}
            help={field.help}
            name={field.name}
            type="date"
            defaultValue={defaultValues[field.name] || ''}
          />
        ))}
    </>
  )
}
