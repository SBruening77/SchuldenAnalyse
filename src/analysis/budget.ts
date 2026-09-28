import type { BalancePoint, Settings, Transaction } from '../db/types'
import { daysInMonth, parseIso, toIso } from '../lib/format'
import { recurringKey, type RecurringItem } from './recurring'

export interface PendingCost {
  name: string
  betrag: number // negativ
  erwarteterTag: number
  ueberfaellig: boolean
  kategorieId?: number
}

export interface BudgetResult {
  /** aktueller Kontostand (rekonstruiert), undefined wenn kein Anker bekannt */
  kontostand?: number
  kontostandQuelle?: 'manuell' | 'auszug'
  kontostandDatum?: string
  /** Summe der noch erwarteten Fixkosten im Budgetmonat (negativ) */
  ausstehendeFixkosten: number
  ausstehend: PendingCost[]
  /** erwartete, noch nicht gebuchte wiederkehrende Einnahmen (positiv) */
  erwarteteEinnahmen: number
  erwarteteEinnahmenListe: PendingCost[]
  puffer: number
  /** Kontostand − ausstehende Fixkosten − Puffer, ohne Untergrenze */
  rechnerisch?: number
  /** max(0, rechnerisch) – das, was ohne Dispo ausgegeben werden kann */
  freiVerfuegbar?: number
  tageVerbleibend: number
  tagesbudget?: number
  monatVon: string
  monatBis: string
  einnahmenBisher: number
  ausgabenBisher: number
  /** Buchungen im laufenden Budgetmonat */
  anzahlBuchungen: number
  hinweise: string[]
  datenStand?: string
}

/** Budgetmonat bestimmen (beginnt am settings.monatsStart) */
export function budgetPeriod(today: string, monatsStart: number): { von: string; bis: string } {
  const d = parseIso(today)!
  const start = Math.min(Math.max(1, monatsStart || 1), 28)
  let y = d.getFullYear()
  let m = d.getMonth()
  if (d.getDate() < start) {
    m -= 1
    if (m < 0) {
      m = 11
      y -= 1
    }
  }
  const von = new Date(y, m, start)
  const bis = new Date(y, m + 1, start - 1)
  if (start === 1) bis.setDate(daysInMonth(y, m))
  return { von: toIso(von), bis: toIso(bis) }
}

/**
 * Aktuellen Kontostand rekonstruieren: jüngster Anker (manuell bevorzugt, wenn neuer als der Auszug)
 * plus alle Buchungen nach dem Ankerdatum.
 */
export function currentBalance(
  transactions: Transaction[],
  anchors: BalancePoint[],
  settings: Settings,
): { saldo: number; quelle: 'manuell' | 'auszug'; datum: string } | undefined {
  const candidates: Array<{ saldo: number; quelle: 'manuell' | 'auszug'; datum: string }> = anchors.map((a) => ({
    saldo: a.saldo,
    quelle: 'auszug' as const,
    datum: a.datum,
  }))
  if (settings.kontostandManuell !== undefined && settings.kontostandManuellDatum) {
    candidates.push({ saldo: settings.kontostandManuell, quelle: 'manuell', datum: settings.kontostandManuellDatum })
  }
  if (candidates.length === 0) return undefined
  // jüngster Anker; bei gleichem Datum gewinnt manuell
  candidates.sort((a, b) => a.datum.localeCompare(b.datum) || (a.quelle === 'manuell' ? 1 : -1))
  const anchor = candidates[candidates.length - 1]
  // Alle Buchungen nach dem Ankerdatum (Buchungen am Ankertag gelten als im Kontostand enthalten)
  const after = transactions.filter((t) => t.buchungsdatum > anchor.datum)
  const saldo = after.reduce((s, t) => s + t.betrag, anchor.saldo)
  return { saldo: Math.round(saldo * 100) / 100, quelle: anchor.quelle, datum: anchor.datum }
}

export function computeBudget(
  transactions: Transaction[],
  anchors: BalancePoint[],
  recurring: RecurringItem[],
  settings: Settings,
  today: string = toIso(new Date()),
): BudgetResult {
  const { von, bis } = budgetPeriod(today, settings.monatsStart)
  const inMonth = transactions.filter((t) => t.buchungsdatum >= von && t.buchungsdatum <= bis)
  const einnahmenBisher = inMonth.filter((t) => t.betrag > 0).reduce((s, t) => s + t.betrag, 0)
  const ausgabenBisher = inMonth.filter((t) => t.betrag < 0).reduce((s, t) => s - t.betrag, 0)

  const bookedKeys = new Set(inMonth.map((t) => `${t.betrag < 0 ? '-' : '+'}${recurringKey(t)}`))
  const todayDay = parseIso(today)!.getDate()

  const ausstehend: PendingCost[] = []
  const erwarteteEinnahmenListe: PendingCost[] = []
  for (const r of recurring) {
    if (!r.aktiv) continue
    if (bookedKeys.has(r.key)) continue
    if (!isDueInPeriod(r, von, bis)) continue
    const entry: PendingCost = {
      name: r.name,
      betrag: r.intervall === 'wöchentlich' ? r.betrag * remainingWeeks(today, bis) : r.betrag,
      erwarteterTag: r.erwarteterTag,
      ueberfaellig: r.erwarteterTag < todayDay - 3,
      kategorieId: r.kategorieId,
    }
    if (r.betrag < 0) ausstehend.push(entry)
    else erwarteteEinnahmenListe.push(entry)
  }
  ausstehend.sort((a, b) => a.erwarteterTag - b.erwarteterTag)
  const ausstehendeFixkosten = ausstehend.reduce((s, p) => s + p.betrag, 0)
  const erwarteteEinnahmen = erwarteteEinnahmenListe.reduce((s, p) => s + p.betrag, 0)

  const bal = currentBalance(transactions, anchors, settings)
  const puffer = settings.sicherheitsPuffer || 0
  const tageVerbleibend = Math.max(1, daysBetween(today, bis) + 1)

  const hinweise: string[] = []
  const datenStand = transactions.reduce((m, t) => (t.buchungsdatum > m ? t.buchungsdatum : m), '') || undefined
  let rechnerisch: number | undefined
  let freiVerfuegbar: number | undefined
  let tagesbudget: number | undefined
  if (bal) {
    rechnerisch = Math.round((bal.saldo + ausstehendeFixkosten - puffer) * 100) / 100
    freiVerfuegbar = Math.max(0, rechnerisch)
    tagesbudget = freiVerfuegbar / tageVerbleibend
    if (bal.saldo < 0) hinweise.push(`Du bist aktuell mit ${fmt(-bal.saldo)} im Dispo.`)
    if (rechnerisch < 0 && bal.saldo >= 0) {
      hinweise.push(`Die noch ausstehenden Fixkosten (${fmt(-ausstehendeFixkosten)}) übersteigen deinen Kontostand um ${fmt(-rechnerisch)}.`)
    }
    if (settings.dispoLimit > 0 && bal.saldo < 0 && -bal.saldo > settings.dispoLimit * 0.8) {
      hinweise.push('Dein Dispolimit ist fast ausgeschöpft.')
    }
    const anchorAge = daysBetween(bal.datum, today)
    if (anchorAge > 21) {
      hinweise.push(
        `Der letzte bekannte Kontostand ist ${anchorAge} Tage alt (${bal.datum.split('-').reverse().join('.')}). Trage den aktuellen Stand in den Einstellungen ein, damit die Zahl stimmt.`,
      )
    }
  } else {
    hinweise.push('Kein Kontostand bekannt. Importiere einen Kontoauszug oder trage den Stand in den Einstellungen ein.')
  }
  const overdue = ausstehend.filter((p) => p.ueberfaellig)
  if (overdue.length) {
    hinweise.push(`${overdue.length} erwartete Buchung(en) sind überfällig: ${overdue.map((o) => o.name).join(', ')}.`)
  }

  return {
    kontostand: bal?.saldo,
    kontostandQuelle: bal?.quelle,
    kontostandDatum: bal?.datum,
    ausstehendeFixkosten,
    ausstehend,
    erwarteteEinnahmen,
    erwarteteEinnahmenListe,
    puffer,
    rechnerisch,
    freiVerfuegbar,
    tageVerbleibend,
    tagesbudget,
    monatVon: von,
    monatBis: bis,
    einnahmenBisher,
    ausgabenBisher,
    anzahlBuchungen: inMonth.length,
    hinweise,
    datenStand,
  }
}

function isDueInPeriod(r: RecurringItem, von: string, bis: string): boolean {
  if (r.intervall === 'monatlich' || r.intervall === 'wöchentlich') return true
  // längere Intervalle: nächster Termin (±10 Tage) fällt in den Zeitraum?
  const next = r.naechsterTermin
  return next >= shift(von, -10) && next <= shift(bis, 10)
}

function remainingWeeks(today: string, bis: string): number {
  return Math.max(1, Math.ceil((daysBetween(today, bis) + 1) / 7))
}

function daysBetween(a: string, b: string): number {
  const da = parseIso(a)
  const dbb = parseIso(b)
  if (!da || !dbb) return 0
  return Math.round((dbb.getTime() - da.getTime()) / 86_400_000)
}

function shift(iso: string, days: number): string {
  const d = parseIso(iso)!
  d.setDate(d.getDate() + days)
  return toIso(d)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}
