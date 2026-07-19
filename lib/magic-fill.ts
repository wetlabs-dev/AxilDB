export type MagicFillApplyMode = 'FILL_MISSING' | 'REPLACE_ALL'

type MagicFillRecord = Record<string, unknown>

function isPlainObject(value: unknown): value is MagicFillRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isMagicFillValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.values(value).every(isMagicFillValueEmpty)
  return false
}

export function getMagicFillConflictState(values: MagicFillRecord, managedFields: readonly string[]) {
  const populatedFields = managedFields.filter((field) => !isMagicFillValueEmpty(values[field]))
  return {
    hasConflict: populatedFields.length > 0,
    populatedCount: populatedFields.length,
    emptyCount: managedFields.length - populatedFields.length,
  }
}

function mergeValue(current: unknown, draft: unknown, mode: MagicFillApplyMode): unknown {
  if (mode === 'REPLACE_ALL') return draft
  if (isPlainObject(current) && isPlainObject(draft)) {
    const merged: MagicFillRecord = { ...current }
    for (const [key, value] of Object.entries(draft)) {
      merged[key] = mergeValue(current[key], value, mode)
    }
    return merged
  }
  if (isMagicFillValueEmpty(current) && !isMagicFillValueEmpty(draft)) return draft
  return current
}

export function applyMagicFillValues<T extends MagicFillRecord>(
  currentValues: T,
  draftValues: MagicFillRecord,
  managedFields: readonly string[],
  mode: MagicFillApplyMode,
): T {
  const next = { ...currentValues }
  for (const field of managedFields) {
    if (!Object.prototype.hasOwnProperty.call(draftValues, field)) continue
    if (draftValues[field] === undefined) continue
    next[field as keyof T] = mergeValue(currentValues[field], draftValues[field], mode) as T[keyof T]
  }
  return next
}

function namedControls(form: HTMLFormElement, name: string) {
  return Array.from(form.elements).filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && element.name === name,
  )
}

export function readMagicFillFormValues(form: HTMLFormElement, managedFields: readonly string[]): MagicFillRecord {
  return Object.fromEntries(managedFields.map((field) => {
    const controls = namedControls(form, field)
    if (controls.length > 1) {
      return [field, controls.map((control) => control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio') ? control.checked && control.value : control.value).filter((value) => value !== false)]
    }
    const control = controls[0]
    if (!control) return [field, null]
    if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) return [field, control.checked]
    return [field, control.value]
  }))
}

function setFormControlValue(form: HTMLFormElement, name: string, value: unknown) {
  const controls = namedControls(form, name)
  if (controls.length === 0) return false
  const control = controls[0]
  if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
    control.checked = Boolean(value)
  } else {
    control.value = value === null || value === undefined ? '' : String(value)
  }
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function applyMagicFillDraftToForm(
  form: HTMLFormElement,
  draftValues: MagicFillRecord,
  managedFields: readonly string[],
  mode: MagicFillApplyMode,
) {
  const currentValues = readMagicFillFormValues(form, managedFields)
  const returnedFields = managedFields.filter((field) => Object.prototype.hasOwnProperty.call(draftValues, field) && draftValues[field] !== undefined)
  if (!returnedFields.some((field) => !isMagicFillValueEmpty(draftValues[field]))) {
    return { appliedCount: 0, preservedCount: 0 }
  }
  const mergedValues = applyMagicFillValues(currentValues, draftValues, managedFields, mode)
  let appliedCount = 0
  let preservedCount = 0

  for (const field of managedFields) {
    if (!Object.prototype.hasOwnProperty.call(draftValues, field)) continue
    if (draftValues[field] === undefined) continue
    const shouldApply = mode === 'REPLACE_ALL'
      ? true
      : isMagicFillValueEmpty(currentValues[field]) && !isMagicFillValueEmpty(draftValues[field])
    if (shouldApply && setFormControlValue(form, field, mergedValues[field])) appliedCount += 1
    else if (!isMagicFillValueEmpty(currentValues[field])) preservedCount += 1
  }

  return { appliedCount, preservedCount }
}
