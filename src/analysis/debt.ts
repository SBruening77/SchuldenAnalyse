import type { BalancePoint, Category, CategoryType, Transaction } from '../db/types'
import { formatEur, formatMonth, monthKeyOf, parseIso, toIso } from '../lib/format'
import type { RecurringItem } from './recurring'

export interface MonthSummary {
  monat: string // yyyy-mm
  einnahmen: number
  ausgaben: number // positiv dargestellt
  fix: number
  variabel: number
  schulden: number
  sonstiges: number
  saldo: number // einnahmen - ausgaben
  defizit: boolean
  anzahl: number
}

export interface CategoryTotal {
  kategorieId: number | undefined
  name: string
  typ: CategoryType
  farbe: string
  summe: number // positiv (Ausgaben)
  anteil: number // 0..1 an allen Ausgaben
  proMonat: number
  anzahl: number
  /** Veränderung letzte 3 Monate vs. davor (relativ), undefined wenn zu wenig Daten */
  trend?: number
}

export interface BalanceSeriesPoint {
  datum: string
  saldo: number
}

export interface NegativeEpisode {
  von: string
  bis: string
  tage: number
  tiefstand: number
  /** Kategorien, die in der Episode am meisten belastet haben */
  verursacher: Array<{ name: string; summe: number }>
}

export interface DebtAnalysis {
  months: MonthSummary[]
  categories: CategoryTotal[]
  series: BalanceSeriesPoint[]
  tageImMinus: number
  tiefstand?: BalanceSeriesPoint
  episoden: NegativeEpisode[]
  schuldenkosten: { gesamt: number; nachKategorie: Array<{ name: string; summe: number; anzahl: number }> }
  ruecklastschriften: number
  fixkostenQuote?: number // Fixkosten / Einnahmen
  findings: Finding[]
}

export interface Finding {
  schwere: 'hoch' | 'mittel' | 'info'
  titel: string
  text: string
}

export function categoryMap(categories: Category[]): Map<number, Category> {
  const m = new Map<number, Category>()
  for (const c of categories) if (c.id !== undefined) m.set(c.id, c)
  return m
}

const UNKNOWN: Category = { name: 'Nicht zugeordnet', typ: 'sonstiges', farbe: '#64748b' }

export function summarizeMonths(transactions: Transaction[], categories: Category[]): MonthSummary[] {
  const cats = categoryMap(categories)
  const map = new Map<string, MonthSummary>()
  for (const t of transactions) {
    const key = monthKeyOf(t.buchungsdatum)
    let m = map.get(key)
    if (!m) {
      m = { monat: key, einnahmen: 0, ausgaben: 0, fix: 0, variabel: 0, schulden: 0, sonstiges: 0, saldo: 0, defizit: false, anzahl: 0 }
      map.set(key, m)
    }
    const cat = (t.kategorieId !== undefined && cats.get(t.kategorieId)) || UNKNOWN
    m.anzahl++
    if (t.betrag > 0) {
      m.einnahmen += t.betrag
    } else {
      const abs = -t.betrag
      m.ausgaben += abs
      if (cat.typ === 'fix') m.fix += abs
      else if (cat.typ === 'variabel') m.variabel += abs
      else if (cat.typ === 'schulden') m.schulden += abs
      else m.sonstiges += abs
    }
  }
  const out = [...map.values()].sort((a, b) => a.monat.localeCompare(b.monat))
  for (const m of out) {
    m.saldo = m.einnahmen - m.ausgaben
    m.defizit = m.saldo < 0
  }
  return out
}

export function totalsByCategory(transactions: Transaction[], categories: Category[]): CategoryTotal[] {
  const cats = categoryMap(categories)
  const expenses = transactions.filter((t) => t.betrag < 0)
  const total = expenses.reduce((s, t) => s - t.betrag, 0)
  const months = new Set(expenses.map((t) => monthKeyOf(t.buchungsdatum)))
  const monthCount = Math.max(1, months.size)
  const sortedMonths = [...months].sort()
  const recent = new Set(sortedMonths.slice(-3))
  const previous = new Set(sortedMonths.slice(-6, -3))

  const map = new Map<number | undefined, CategoryTotal & { recent: number; previous: number }>()
  for (const t of expenses) {
    const cat = (t.kategorieId !== undefined && cats.get(t.kategorieId)) || UNKNOWN
    const id = cat.id
    let e = map.get(id)
    if (!e) {
      e = { kategorieId: id, name: cat.name, typ: cat.typ, farbe: cat.farbe, summe: 0, anteil: 0, proMonat: 0, anzahl: 0, recent: 0, previous: 0 }
      map.set(id, e)
    }
    const abs = -t.betrag
    e.summe += abs
    e.anzahl++
    const mk = monthKeyOf(t.buchungsdatum)
    if (recent.has(mk)) e.recent += abs
    if (previous.has(mk)) e.previous += abs
  }
  return [...map.values()]
    .map(
      (e): CategoryTotal => ({
        kategorieId: e.kategorieId,
        name: e.name,
        typ: e.typ,
        farbe: e.farbe,
        summe: e.summe,
        anzahl: e.anzahl,
        anteil: total > 0 ? e.summe / total : 0,
        proMonat: e.summe / monthCount,
        trend: previous.size === 3 && e.previous > 0 ? e.recent / e.previous - 1 : undefined,
      }),
    )
    .sort((a, b) => b.summe - a.summe)
}

/**
 * Rekonstruiert den Saldoverlauf: Ankerpunkt ist der jüngste bekannte Kontostand
 * (manuell oder aus dem Auszug); davon werden Buchungen rückwärts abgezogen bzw. vorwärts addiert.
 * Ergebnis: ein Punkt pro Buchungstag (Saldo am Tagesende) plus Ankerpunkte.
 */
export function buildBalanceSeries(transactions: Transaction[], anchors: BalancePoint[]): BalanceSeriesPoint[] {
  if (anchors.length === 0 || transactions.length === 0) {
    if (anchors.length) return [...anchors].sort((a, b) => a.datum.localeCompare(b.datum))
    return []
  }
  const anchor = [...anchors].sort((a, b) => a.datum.localeCompare(b.datum))[anchors.length - 1]
  const txs = [...transactions].sort((a, b) => a.buchungsdatum.localeCompare(b.buchungsdatum))
  // alle Buchungstage plus alle Ankertage (damit z. B. der Anfangssaldo eines Auszugs als Punkt erscheint)
  const days = [...new Set([...txs.map((t) => t.buchungsdatum), ...anchors.map((a) => a.datum)])].sort()

  // Saldo am Ankertag = anchor.saldo. Für Tag D < Anker: anchor - Σ(D < tx ≤ Anker); D > Anker: anchor + Σ(Anker < tx ≤ D)
  const perDay = new Map<string, number>()
  for (const t of txs) perDay.set(t.buchungsdatum, (perDay.get(t.buchungsdatum) ?? 0) + t.betrag)

  // Rückwärts: Saldo(Ende Tag D) = Saldo(Ende Folgetag mit Buchungen) − Buchungen dieses Folgetags.
  // Buchungen am Ankertag sind im Ankersaldo bereits enthalten.
  const before: BalanceSeriesPoint[] = []
  let running = anchor.saldo
  let nextDay = anchor.datum
  for (const d of days.filter((x) => x < anchor.datum).reverse()) {
    running -= perDay.get(nextDay) ?? 0
    before.unshift({ datum: d, saldo: round2(running) })
    nextDay = d
  }
  const result: BalanceSeriesPoint[] = [...before, { datum: anchor.datum, saldo: round2(anchor.saldo) }]
  running = anchor.saldo
  for (const d of days.filter((x) => x > anchor.datum)) {
    running += perDay.get(d) ?? 0
    result.push({ datum: d, saldo: round2(running) })
  }
  return result
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Tage im Minus und zusammenhängende Negativ-Episoden aus dem Saldoverlauf */
export function negativeEpisodes(
  series: BalanceSeriesPoint[],
  transactions: Transaction[],
  categories: Category[],
  bisDatum?: string,
): { tageImMinus: number; episoden: NegativeEpisode[]; tiefstand?: BalanceSeriesPoint } {
  if (series.length === 0) return { tageImMinus: 0, episoden: [] }
  const cats = categoryMap(categories)
  const end = bisDatum ?? series[series.length - 1].datum
  const episoden: NegativeEpisode[] = []
  let tageImMinus = 0
  let tiefstand: BalanceSeriesPoint | undefined
  let current: { von: string; tiefstand: number } | null = null

  const closeEpisode = (bis: string) => {
    if (!current) return
    const tage = Math.max(1, daysBetweenIso(current.von, bis))
    tageImMinus += tage
    const txsIn = transactions.filter((t) => t.betrag < 0 && t.buchungsdatum >= current!.von && t.buchungsdatum <= bis)
    const byCat = new Map<string, number>()
    for (const t of txsIn) {
      const name = (t.kategorieId !== undefined && cats.get(t.kategorieId)?.name) || UNKNOWN.name
      byCat.set(name, (byCat.get(name) ?? 0) - t.betrag)
    }
    episoden.push({
      von: current.von,
      bis,
      tage,
      tiefstand: current.tiefstand,
      verursacher: [...byCat.entries()]
        .map(([name, summe]) => ({ name, summe }))
        .sort((a, b) => b.summe - a.summe)
        .slice(0, 3),
    })
    current = null
  }

  for (let i = 0; i < series.length; i++) {
    const p = series[i]
    if (!tiefstand || p.saldo < tiefstand.saldo) tiefstand = p
    if (p.saldo < 0) {
      if (!current) current = { von: p.datum, tiefstand: p.saldo }
      else current.tiefstand = Math.min(current.tiefstand, p.saldo)
    } else if (current) {
      closeEpisode(p.datum)
    }
  }
  if (current) closeEpisode(end)
  return { tageImMinus, episoden, tiefstand: tiefstand && tiefstand.saldo < 0 ? tiefstand : undefined }
}

function daysBetweenIso(a: string, b: string): number {
  const da = parseIso(a)
  const dbb = parseIso(b)
  if (!da || !dbb) return 0
  return Math.round((dbb.getTime() - da.getTime()) / 86_400_000)
}

export function analyzeDebt(
  transactions: Transaction[],
  categories: Category[],
  anchors: BalancePoint[],
  recurring: RecurringItem[],
  today: string = toIso(new Date()),
): DebtAnalysis {
  const cats = categoryMap(categories)
  const months = summarizeMonths(transactions, categories)
  const catTotals = totalsByCategory(transactions, categories)
  const series = buildBalanceSeries(transactions, anchors)
  const lastDate = transactions.reduce((m, t) => (t.buchungsdatum > m ? t.buchungsdatum : m), '')
  const { tageImMinus, episoden, tiefstand } = negativeEpisodes(series, transactions, categories, lastDate || today)

  // Schuldenkosten
  const schuldenTx = transactions.filter((t) => t.betrag < 0 && t.kategorieId !== undefined && cats.get(t.kategorieId)?.typ === 'schulden')
  const nachKat = new Map<string, { summe: number; anzahl: number }>()
  for (const t of schuldenTx) {
    const name = cats.get(t.kategorieId!)!.name
    const e = nachKat.get(name) ?? { summe: 0, anzahl: 0 }
    e.summe -= t.betrag
    e.anzahl++
    nachKat.set(name, e)
  }
  const schuldenkosten = {
    gesamt: schuldenTx.reduce((s, t) => s - t.betrag, 0),
    nachKategorie: [...nachKat.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.summe - a.summe),
  }
  const ruecklastschriften = schuldenTx.filter((t) => /rücklastschrift|ruecklastschrift|retoure|rückgabe/i.test(`${t.buchungsart} ${t.text}`)).length

  // Fixkostenquote: bevorzugt aus erkannten wiederkehrenden Buchungen, sonst aus Kategorien vom Typ "fix"
  const recurringFix = -recurring.filter((r) => r.aktiv && r.betrag < 0).reduce((s, r) => s + r.monatlich, 0)
  const avgFixByCategory = months.length ? months.reduce((s, m) => s + m.fix + m.schulden, 0) / months.length : 0
  const fixMonthly = recurringFix > 0 ? recurringFix : avgFixByCategory
  const incomeMonthly = recurring.filter((r) => r.aktiv && r.betrag > 0).reduce((s, r) => s + r.monatlich, 0)
  const avgIncome = months.length ? months.reduce((s, m) => s + m.einnahmen, 0) / months.length : 0
  const incomeRef = incomeMonthly || avgIncome
  const fixkostenQuote = incomeRef > 0 && fixMonthly > 0 ? fixMonthly / incomeRef : undefined

  const findings = buildFindings({ months, catTotals, tageImMinus, tiefstand, episoden, schuldenkosten, ruecklastschriften, fixkostenQuote, fixMonthly, incomeRef, recurring, cats })

  return { months, categories: catTotals, series, tageImMinus, tiefstand, episoden, schuldenkosten, ruecklastschriften, fixkostenQuote, findings }
}

function buildFindings(ctx: {
  months: MonthSummary[]
  catTotals: CategoryTotal[]
  tageImMinus: number
  tiefstand?: BalanceSeriesPoint
  episoden: NegativeEpisode[]
  schuldenkosten: DebtAnalysis['schuldenkosten']
  ruecklastschriften: number
  fixkostenQuote?: number
  fixMonthly: number
  incomeRef: number
  recurring: RecurringItem[]
  cats: Map<number, Category>
}): Finding[] {
  const f: Finding[] = []
  const { months } = ctx
  if (months.length === 0) return f

  // vollständige Monate (erster/letzter Monat evtl. unvollständig → trotzdem berücksichtigen, aber Hinweis)
  const defizitMonate = months.filter((m) => m.defizit)
  if (defizitMonate.length > 0) {
    const avg = defizitMonate.reduce((s, m) => s + m.saldo, 0) / defizitMonate.length
    f.push({
      schwere: defizitMonate.length >= months.length / 2 ? 'hoch' : 'mittel',
      titel: `In ${defizitMonate.length} von ${months.length} Monaten mehr ausgegeben als eingenommen`,
      text: `Durchschnittliches Minus in diesen Monaten: ${formatEur(avg)}. Betroffen: ${defizitMonate.map((m) => formatMonth(m.monat)).join(', ')}.`,
    })
  } else {
    f.push({ schwere: 'info', titel: 'Kein Monat mit Defizit', text: 'In allen erfassten Monaten waren die Einnahmen höher als die Ausgaben.' })
  }

  if (ctx.tageImMinus > 0) {
    f.push({
      schwere: ctx.tageImMinus > 30 ? 'hoch' : 'mittel',
      titel: `Konto an ${ctx.tageImMinus} Tagen im Minus`,
      text: ctx.tiefstand
        ? `Tiefster Stand: ${formatEur(ctx.tiefstand.saldo)} am ${ctx.tiefstand.datum.split('-').reverse().join('.')}. ${ctx.episoden.length} Phase(n) im Dispo.`
        : `${ctx.episoden.length} Phase(n) im Dispo.`,
    })
    const worst = [...ctx.episoden].sort((a, b) => a.tiefstand - b.tiefstand)[0]
    if (worst && worst.verursacher.length) {
      f.push({
        schwere: 'mittel',
        titel: 'Was das Konto ins Minus gedrückt hat',
        text: `In der Phase ${worst.von.split('-').reverse().join('.')} – ${worst.bis.split('-').reverse().join('.')} waren die größten Posten: ${worst.verursacher
          .map((v) => `${v.name} (${formatEur(v.summe, { abs: true })})`)
          .join(', ')}.`,
      })
    }
  }

  if (ctx.schuldenkosten.gesamt > 0) {
    f.push({
      schwere: ctx.schuldenkosten.gesamt > 100 ? 'hoch' : 'mittel',
      titel: `Direkte Schuldenkosten: ${formatEur(ctx.schuldenkosten.gesamt, { abs: true })}`,
      text: `Das Geld ist weg, ohne dass du etwas dafür bekommst: ${ctx.schuldenkosten.nachKategorie
        .map((k) => `${k.name} ${formatEur(k.summe, { abs: true })} (${k.anzahl}×)`)
        .join(', ')}.`,
    })
  }
  if (ctx.ruecklastschriften > 0) {
    f.push({
      schwere: 'hoch',
      titel: `${ctx.ruecklastschriften} Rücklastschrift(en)`,
      text: 'Rücklastschriften entstehen, wenn beim Einzug kein Geld auf dem Konto ist. Sie kosten Gebühren und verschlechtern deine Bonität. Fixkosten möglichst direkt nach Gehaltseingang terminieren.',
    })
  }

  if (ctx.fixkostenQuote !== undefined) {
    const pct = Math.round(ctx.fixkostenQuote * 100)
    f.push({
      schwere: pct > 70 ? 'hoch' : pct > 55 ? 'mittel' : 'info',
      titel: `Fixkostenquote ${pct} %`,
      text: `Wiederkehrende Kosten von ${formatEur(ctx.fixMonthly, { abs: true })}/Monat bei ${formatEur(ctx.incomeRef, { abs: true })} Einnahmen. ${
        pct > 55 ? 'Über 50 % gelten als kritisch – prüfe Abos, Versicherungen und Verträge.' : 'Das ist ein gesunder Bereich.'
      }`,
    })
  }

  const bnpl = ctx.recurring.filter((r) => r.aktiv && r.betrag < 0 && r.kategorieId !== undefined && ctx.cats.get(r.kategorieId)?.typ === 'schulden')
  if (bnpl.length > 0) {
    const sum = -bnpl.reduce((s, r) => s + r.monatlich, 0)
    f.push({
      schwere: 'mittel',
      titel: `${bnpl.length} laufende Raten / Kredite`,
      text: `${formatEur(sum, { abs: true })} pro Monat gehen an ${bnpl.map((b) => b.name).join(', ')}. Jede neue Rate verkleinert dauerhaft deinen Spielraum.`,
    })
  }

  const top = ctx.catTotals.filter((c) => c.typ === 'variabel').slice(0, 2)
  if (top.length) {
    f.push({
      schwere: 'info',
      titel: `Größte variable Ausgaben: ${top.map((t) => t.name).join(' und ')}`,
      text: top
        .map((t) => `${t.name}: ${formatEur(t.proMonat, { abs: true })}/Monat (${Math.round(t.anteil * 100)} % aller Ausgaben)${t.trend !== undefined ? `, Trend ${t.trend >= 0 ? '+' : ''}${Math.round(t.trend * 100)} %` : ''}`)
        .join('; ') + '. Hier hast du den direktesten Einfluss.',
    })
  }

  const rising = ctx.catTotals.filter((c) => c.trend !== undefined && c.trend > 0.3 && c.summe > 50)
  if (rising.length) {
    f.push({
      schwere: 'mittel',
      titel: 'Stark steigende Ausgaben',
      text: rising.map((c) => `${c.name} +${Math.round(c.trend! * 100)} %`).join(', ') + ' (letzte 3 Monate gegenüber den 3 Monaten davor).',
    })
  }

  return f.sort((a, b) => severityRank(a.schwere) - severityRank(b.schwere))
}

function severityRank(s: Finding['schwere']): number {
  return s === 'hoch' ? 0 : s === 'mittel' ? 1 : 2
}
