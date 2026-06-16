'use client'

export function BulkCareSelectionControls({ formId }: { formId: string }) {
  function setChecked(checked: boolean) {
    const form = document.getElementById(formId)
    if (!form) return
    form.querySelectorAll<HTMLInputElement>('input[name="plantInstanceId"]').forEach((input) => {
      input.checked = checked
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setChecked(true)} className="rounded-md border border-stone-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-stone-700">
        Select all
      </button>
      <button type="button" onClick={() => setChecked(false)} className="rounded-md border border-stone-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-stone-700">
        Deselect all
      </button>
    </div>
  )
}
