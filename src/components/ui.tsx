import type { ReactNode } from 'react'
import type { Category } from '../db/types'
import { formatEur } from '../lib/format'

export function Money({ value, className = '', abs = false, colored = true }: { value: number; className?: string; abs?: boolean; colored?: boolean }) {
  const color = !colored ? '' : value < 0 ? 'text-rose-400' : value > 0 ? 'text-emerald-400' : 'text-slate-300'
  return <span className={`tabular-nums ${color} ${className}`}>{formatEur(value, { abs })}</span>
}

export function CategoryBadge({ category, small = false }: { category?: Category; small?: boolean }) {
  const name = category?.name ?? 'Nicht zugeordnet'
  const color = category?.farbe ?? '#64748b'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-slate-800 ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} text-slate-200 whitespace-nowrap`}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="card text-center py-10">
      <p className="text-lg font-semibold">{title}</p>
      {text && <p className="mt-2 text-sm text-slate-400">{text}</p>}
      {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
    </div>
  )
}

export function Callout({ kind, children }: { kind: 'hoch' | 'mittel' | 'info' | 'ok'; children: ReactNode }) {
  const styles = {
    hoch: 'border-rose-500/40 bg-rose-500/10 text-rose-100',
    mittel: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  }[kind]
  return <div className={`rounded-xl border px-3 py-2.5 text-sm ${styles}`}>{children}</div>
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="safe-top sticky top-0 z-10 bg-slate-950/90 backdrop-blur border-b border-slate-800">
      <div className="flex items-end justify-between px-4 pt-3 pb-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="safe-bottom w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl bg-slate-900 border-t border-slate-700 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="btn-secondary px-3 py-1.5 text-sm" onClick={onClose}>
            Schließen
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-300">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function ProgressBar({ value, max, color = '#10b981' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}
