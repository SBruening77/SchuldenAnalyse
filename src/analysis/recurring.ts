import type { Transaction } from '../db/types'
import { parseIso } from '../lib/format'

export type Interval = 'wöchentlich' | 'monatlich' | 'vierteljährlich' | 'halbjährlich' | 'jährlich'

export interface RecurringItem {
  key: string
  name: string
  kategorieId?: number
  intervall: Interval
  /** typischer Betrag (Median), Vorzeichen wie Buchung */
  betrag: number
  /** monatliches Äquivalent (positiv für Kosten-Summen bequem: gleiches Vorzeichen wie betrag) */
  monatlich: number
  anzahl: number
  ersterTermin: string
  letzterTermin: string
  /** erwarteter Tag im Monat (1–31) */
  erwarteterTag: number
  /** nächster erwarteter Termin (ISO) */
  naechsterTermin: string
  /** true, wenn die letzte Buchung nicht länger als 1,6 Intervalle zurückliegt */
  aktiv: boolean
  transactionIds: number[]
}

const INTERVALS: Array<{ name: Interval; days: number; min: number; max: number; perMonth: number }> = [
  { name: 'wöchentlich', days: 7, min: 5, max: 9, perMonth: 52 / 12 },
  { name: 'monatlich', days: 30, min: 24, max: 37, perMonth: 1 },
  { name: 'vierteljährlich', days: 91, min: 80, max: 100, perMonth: 1 / 3 },
  { name: 'halbjährlich', days: 182, min: 170, max: 195, perMonth: 1 / 6 },
  { name: 'jährlich', days: 365, min: 350, max: 380, perMonth: 1 / 12 },
]

export function recurringKey(t: Pick<Transaction, 'gegenpartei' | 'text' | 'buchungsart'>): string {
  const base = (t.gegenpartei || t.text || t.buchungsart)
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-zäöüß& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = base.split(' ').filter((w) => w.length > 1)
  return words.slice(0, 2).join(' ') || base
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function daysBetween(a: string, b: string): number {
  const da = parseIso(a)
  const dbb = parseIso(b)
  if (!da || !dbb) return 0
  return Math.round((dbb.getTime() - da.getTime()) / 86_400_000)
}

function addDays(iso: string, days: number): string {
  const d = parseIso(iso)
  if (!d) return iso
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Erkennt wiederkehrende Buchungen (Fixkosten, Abos, Raten, aber auch regelmäßige Einnahmen).
 * Gruppierung nach Gegenpartei-Kern, dann Cluster nach ähnlichem Betrag, dann Prüfung des Abstands.
 */
export function detectRecurring(transactions: Transaction[], opts: { referenceDate?: string } = {}): RecurringItem[] {
  const ref = opts.referenceDate ?? transactions.reduce((m, t) => (t.buchungsdatum > m ? t.buchungsdatum : m), '')
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.betrag === 0) continue
    const key = `${t.betrag < 0 ? '-' : '+'}${recurringKey(t)}`
    const g = groups.get(key)
    if (g) g.push(t)
    else groups.set(key, [t])
  }

  const items: RecurringItem[] = []
  for (const [key, group] of groups) {
    if (group.length < 2) continue
    for (const cluster of clusterByAmount(group)) {
      if (cluster.length < 2) continue
      const sorted = [...cluster].sort((a, b) => a.buchungsdatum.localeCompare(b.buchungsdatum))
      // pro Tag nur eine Buchung zählen (Doppelbuchungen)
      const unique = sorted.filter((t, i) => i === 0 || t.buchungsdatum !== sorted[i - 1].buchungsdatum)
      if (unique.length < 2) continue
      const gaps = unique.slice(1).map((t, i) => daysBetween(unique[i].buchungsdatum, t.buchungsdatum))
      const med = median(gaps)
      const interval = INTERVALS.find((iv) => med >= iv.min && med <= iv.max)
      if (!interval) continue
      // Mindestens 70 % der Abstände müssen zum Intervall passen (Toleranz ±35 %)
      const fitting = gaps.filter((g) => Math.abs(g - interval.days) <= interval.days * 0.35).length
      if (fitting / gaps.length < 0.7) continue
      // Jährliche/halbjährliche Muster brauchen mind. 2 Abstände, um Zufall auszuschließen
      if ((interval.name === 'jährlich' || interval.name === 'halbjährlich') && gaps.length < 2 && unique.length < 3) continue

      const betrag = median(unique.map((t) => t.betrag))
      const last = unique[unique.length - 1].buchungsdatum
      const days = unique.map((t) => parseIso(t.buchungsdatum)?.getDate() ?? 1)
      const erwarteterTag = Math.round(median(days))
      const aktiv = daysBetween(last, ref) <= interval.days * 1.6
      items.push({
        key,
        name: unique[unique.length - 1].gegenpartei || unique[unique.length - 1].text,
        kategorieId: unique[unique.length - 1].kategorieId,
        intervall: interval.name,
        betrag,
        monatlich: betrag * interval.perMonth,
        anzahl: unique.length,
        ersterTermin: unique[0].buchungsdatum,
        letzterTermin: last,
        erwarteterTag,
        naechsterTermin: addDays(last, interval.days),
        aktiv,
        transactionIds: unique.map((t) => t.id!).filter((id) => id !== undefined),
      })
    }
  }
  return items.sort((a, b) => Math.abs(b.monatlich) - Math.abs(a.monatlich))
}

/** Cluster nach ähnlichem Betrag (±12 % oder ±2 €) */
function clusterByAmount(group: Transaction[]): Transaction[][] {
  const sorted = [...group].sort((a, b) => Math.abs(a.betrag) - Math.abs(b.betrag))
  const clusters: Transaction[][] = []
  for (const t of sorted) {
    const abs = Math.abs(t.betrag)
    const last = clusters[clusters.length - 1]
    if (last) {
      const ref = Math.abs(median(last.map((x) => x.betrag)))
      if (Math.abs(abs - ref) <= Math.max(2, ref * 0.12)) {
        last.push(t)
        continue
      }
    }
    clusters.push([t])
  }
  return clusters
}

/** Summe der monatlichen Fixkosten (negativ) aktiver, wiederkehrender Ausgaben */
export function monthlyFixedCosts(items: RecurringItem[]): number {
  return items.filter((i) => i.aktiv && i.betrag < 0).reduce((s, i) => s + i.monatlich, 0)
}

/** Summe der monatlichen wiederkehrenden Einnahmen (positiv) */
export function monthlyRecurringIncome(items: RecurringItem[]): number {
  return items.filter((i) => i.aktiv && i.betrag > 0).reduce((s, i) => s + i.monatlich, 0)
}
