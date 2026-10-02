import type { BalancePoint, Category, Settings, Transaction } from '../db/types'
import { formatEur, monthKeyOf } from '../lib/format'
import type { BudgetResult } from './budget'
import { buildBalanceSeries, negativeEpisodes, summarizeMonths, totalsByCategory } from './debt'
import { monthlyFixedCosts, monthlyRecurringIncome, type Interval, type RecurringItem } from './recurring'

export type KandidatStufe = 'sofort' | 'pruefen' | 'belastend'

export interface KuendigungsKandidat {
  key: string
  name: string
  kategorieId?: number
  kategorieName: string
  intervall: Interval
  /** monatliche Kosten, positiv */
  monatlich: number
  stufe: KandidatStufe
  /** eine Buchung dieses Postens fiel in eine Minus-Episode */
  dispoAusloeser: boolean
}

export interface EscapeStufe {
  /** der Posten, der in dieser Stufe dazukommt */
  name: string
  aktion: 'kündigen' | 'prüfen'
  /** monatlicher Betrag genau dieses Postens, positiv */
  betragMonatlich: number
  /** Summe aller bis hier gekündigten/geprüften Posten pro Monat */
  spielraumMonatlich: number
  /** Monate bis Null nach dieser Stufe; fehlt, wenn weiter kein Überschuss */
  monate?: number
  /** Verkürzung gegenüber dem Basisplan */
  monateFrueher?: number
  /** grob eingesparte Dispozinsen durch die kürzere Minus-Zeit */
  zinsenGespart?: number
}

export interface VariablerHebel {
  name: string
  monatlich: number
  /** 10 % dieser Kategorie */
  zehnProzent: number
}

export interface EscapePlan {
  kandidaten: KuendigungsKandidat[]
  /** Summe der Stufen „sofort“ und „prüfen“ pro Monat */
  kuendbarMonatlich: number
  /** wiederkehrende Einnahmen minus aktive Fixkosten; negativ = monatliche Lücke */
  ueberschussMonatlich: number
  ueberschussQuelle: 'wiederkehrend' | 'durchschnitt'
  /** max(0, −Kontostand) */
  luecke: number
  kontostandBekannt: boolean
  imMinus: boolean
  /** Monate bis Null beim heutigen Überschuss */
  monateBasis?: number
  stufen: EscapeStufe[]
  variablerHebel?: VariablerHebel
  /** gesetzt, wenn ein Abbau ohne Einsparung nicht möglich ist */
  hinweis?: string
  ueberDispolimit: boolean
  /** aktive wiederkehrende Ausgaben ohne brauchbare Kategorie */
  unzugeordnet: number
}

const ABO_MUSTER =
  /netflix|spotify|disney|dazn|\bsky\b|fitness|mcfit|playstation|\bxbox\b|youtube|itunes|apple\.com|google play|prime video|amazon prime|clever fit|\bwow\b/i

const PRUEFEN_KATEGORIEN = new Set([
  'Telefon / Internet',
  'Versicherungen',
  'Mobilität / Auto',
  'Strom / Gas / Wasser',
])

const STUFE_RANG: Record<KandidatStufe, number> = { sofort: 0, pruefen: 1, belastend: 2 }

export function buildEscapePlan(
  transactions: Transaction[],
  categories: Category[],
  recurring: RecurringItem[],
  budget: BudgetResult,
  settings: Settings,
  anchors: BalancePoint[],
): EscapePlan {
  const cats = new Map<number, Category>()
  for (const c of categories) if (c.id !== undefined) cats.set(c.id, c)

  const series = buildBalanceSeries(transactions, anchors)
  const { episoden } = negativeEpisodes(series, transactions, categories)
  const byId = new Map<number, Transaction>()
  for (const t of transactions) if (t.id !== undefined) byId.set(t.id, t)

  const kandidaten: KuendigungsKandidat[] = []
  let unzugeordnet = 0
  for (const item of recurring) {
    if (!item.aktiv || item.betrag >= 0) continue
    const cat = item.kategorieId !== undefined ? cats.get(item.kategorieId) : undefined
    const stufe = classify(item, cat)
    if (!stufe) {
      if (isUnassigned(cat)) unzugeordnet++
      continue
    }
    const dates = item.transactionIds.map((id) => byId.get(id)?.buchungsdatum).filter((d): d is string => !!d)
    kandidaten.push({
      key: item.key,
      name: item.name,
      kategorieId: item.kategorieId,
      kategorieName: cat?.name ?? 'Nicht zugeordnet',
      intervall: item.intervall,
      monatlich: round2(-item.monatlich),
      stufe,
      dispoAusloeser: dates.some((d) => episoden.some((e) => d >= e.von && d <= e.bis)),
    })
  }
  kandidaten.sort(
    (a, b) => STUFE_RANG[a.stufe] - STUFE_RANG[b.stufe] || Number(b.dispoAusloeser) - Number(a.dispoAusloeser) || b.monatlich - a.monatlich,
  )

  const kuendbarMonatlich = round2(kandidaten.filter((k) => k.stufe !== 'belastend').reduce((s, k) => s + k.monatlich, 0))

  const recIncome = monthlyRecurringIncome(recurring)
  const recFix = monthlyFixedCosts(recurring)
  let ueberschussMonatlich = recIncome + recFix
  let ueberschussQuelle: EscapePlan['ueberschussQuelle'] = 'wiederkehrend'
  if (recIncome === 0 && recFix === 0) {
    const avg = averageCompleteMonthSaldo(transactions, categories, monthKeyOf(budget.monatVon))
    if (avg !== undefined) {
      ueberschussMonatlich = avg
      ueberschussQuelle = 'durchschnitt'
    }
  }
  ueberschussMonatlich = round2(ueberschussMonatlich)

  const kontostandBekannt = budget.kontostand !== undefined
  const imMinus = kontostandBekannt && budget.kontostand! < 0
  const luecke = imMinus ? round2(-budget.kontostand!) : 0
  const monateBasis = monateBisNull(luecke, ueberschussMonatlich)
  const zinsProMonat = averageOverdraftInterest(transactions, categories)

  const stufen: EscapeStufe[] = []
  let summe = 0
  for (const k of kandidaten) {
    if (k.stufe === 'belastend') continue
    summe += k.monatlich
    const monate = monateBisNull(luecke, ueberschussMonatlich + summe)
    const monateFrueher = monate !== undefined && monateBasis !== undefined ? monateBasis - monate : undefined
    stufen.push({
      name: k.name,
      aktion: k.stufe === 'sofort' ? 'kündigen' : 'prüfen',
      betragMonatlich: k.monatlich,
      spielraumMonatlich: round2(summe),
      monate,
      monateFrueher: monateFrueher !== undefined && monateFrueher > 0.05 ? round2(monateFrueher) : undefined,
      zinsenGespart:
        monateFrueher !== undefined && monateFrueher > 0.05 && zinsProMonat > 0 ? round2(zinsProMonat * monateFrueher) : undefined,
    })
  }

  const variabel = totalsByCategory(transactions, categories).find((c) => c.typ === 'variabel' && c.proMonat >= 10)
  const variablerHebel = variabel
    ? { name: variabel.name, monatlich: round2(variabel.proMonat), zehnProzent: round2(variabel.proMonat * 0.1) }
    : undefined

  let hinweis: string | undefined
  if (imMinus && ueberschussMonatlich <= 0) {
    hinweis =
      ueberschussMonatlich < -0.005
        ? `Aktuell kein Überschuss – ohne Einsparung wächst der Dispo weiter. Dir fehlen ${formatEur(-ueberschussMonatlich)} pro Monat.`
        : 'Aktuell kein Überschuss – ohne Einsparung wächst der Dispo weiter. Es bleibt nichts übrig, um den Dispo abzubauen.'
  }

  return {
    kandidaten,
    kuendbarMonatlich,
    ueberschussMonatlich,
    ueberschussQuelle,
    luecke,
    kontostandBekannt,
    imMinus,
    monateBasis,
    stufen,
    variablerHebel,
    hinweis,
    ueberDispolimit: settings.dispoLimit > 0 && luecke > settings.dispoLimit,
    unzugeordnet,
  }
}

function classify(item: RecurringItem, cat: Category | undefined): KandidatStufe | undefined {
  const blob = `${item.name} ${item.key}`
  if (cat?.typ === 'schulden') return 'belastend'
  if (cat?.name === 'Abos / Streaming' || ABO_MUSTER.test(blob)) return 'sofort'
  if (cat && PRUEFEN_KATEGORIEN.has(cat.name)) return 'pruefen'
  return undefined
}

function isUnassigned(cat: Category | undefined): boolean {
  if (!cat) return true
  if (cat.name === 'Umbuchung / Sparen') return false
  return cat.typ === 'sonstiges'
}

function monateBisNull(luecke: number, ueberschuss: number): number | undefined {
  if (luecke <= 0 || ueberschuss <= 0) return undefined
  return luecke / ueberschuss
}

function averageCompleteMonthSaldo(transactions: Transaction[], categories: Category[], currentMonth: string): number | undefined {
  const months = summarizeMonths(transactions, categories).filter((m) => m.monat < currentMonth)
  if (months.length === 0) return undefined
  return months.reduce((s, m) => s + m.saldo, 0) / months.length
}

function averageOverdraftInterest(transactions: Transaction[], categories: Category[]): number {
  const id = categories.find((c) => c.name === 'Dispozinsen / Kontoführung')?.id
  if (id === undefined) return 0
  const zinsen = transactions.filter((t) => t.betrag < 0 && t.kategorieId === id).reduce((s, t) => s - t.betrag, 0)
  const months = new Set(transactions.map((t) => monthKeyOf(t.buchungsdatum)))
  return months.size > 0 ? zinsen / months.size : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
