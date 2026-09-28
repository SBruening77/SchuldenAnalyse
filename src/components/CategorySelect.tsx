import type { Category, CategoryType } from '../db/types'
import { CATEGORY_TYPE_LABELS } from '../categorize/defaultRules'

const ORDER: CategoryType[] = ['einkommen', 'fix', 'variabel', 'schulden', 'sonstiges']

export function CategorySelect({
  categories,
  value,
  onChange,
  allowEmpty = false,
  className = '',
}: {
  categories: Category[]
  value?: number
  onChange: (id: number | undefined) => void
  allowEmpty?: boolean
  className?: string
}) {
  return (
    <select
      className={`input ${className}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    >
      {allowEmpty && <option value="">– automatisch –</option>}
      {ORDER.map((typ) => {
        const items = categories.filter((c) => c.typ === typ)
        if (!items.length) return null
        return (
          <optgroup key={typ} label={CATEGORY_TYPE_LABELS[typ]}>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
