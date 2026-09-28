const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const eurNoSign = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'never',
})

export function formatEur(value: number, opts?: { abs?: boolean }): string {
  if (!Number.isFinite(value)) return '–'
  const v = Math.abs(value) < 0.005 ? 0 : value // -0 und Rundungsreste vermeiden
  return opts?.abs ? eurNoSign.format(v) : eur.format(v)
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateShortFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
const monthShortFmt = new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit' })

export function formatDate(iso: string): string {
  const d = parseIso(iso)
  return d ? dateFmt.format(d) : iso
}

export function formatDateShort(iso: string): string {
  const d = parseIso(iso)
  return d ? dateShortFmt.format(d) : iso
}

/** monthKey: yyyy-mm */
export function formatMonth(monthKey: string): string {
  const d = parseIso(`${monthKey}-01`)
  return d ? monthFmt.format(d) : monthKey
}

export function formatMonthShort(monthKey: string): string {
  const d = parseIso(`${monthKey}-01`)
  return d ? monthShortFmt.format(d) : monthKey
}

export function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayIso(): string {
  return toIso(new Date())
}

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7)
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

export function formatPercent(v: number): string {
  return `${Math.round(v * 100)} %`
}
