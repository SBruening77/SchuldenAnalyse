import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/types'
import { DEFAULT_SETTINGS } from '../db/types'
import { detectRecurring, monthlyFixedCosts } from './recurring'
import { buildBalanceSeries, negativeEpisodes, summarizeMonths, totalsByCategory, analyzeDebt } from './debt'
import { budgetPeriod, computeBudget, currentBalance } from './budget'
import { categorize, buildCategoryLookup } from '../categorize/rules'
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from '../categorize/defaultRules'

const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1 }))
const catId = (name: string) => categories.find((c) => c.name === name)!.id!
const rules = DEFAULT_RULES.map((r, i) => ({ id: i + 1, schlagwort: r.schlagwort, kategorieId: catId(r.kategorie), prioritaet: r.prioritaet ?? 50 }))
const lookup = buildCategoryLookup(categories)

let nextId = 1
function tx(datum: string, betrag: number, gegenpartei: string, kategorie?: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId++,
    hash: `h${nextId}`,
    buchungsdatum: datum,
    valuta: datum,
    buchungsart: betrag < 0 ? 'Lastschrift' : 'Gutschrift',
    gegenpartei,
    text: gegenpartei,
    betrag,
    kategorieId: kategorie ? catId(kategorie) : undefined,
    quelle: 'pdf',
    ...extra,
  }
}

// 4 Monate: Gehalt, Miete, Netflix, variable Einkäufe, Dispozinsen
const sample: Transaction[] = [
  tx('2024-01-01', -650, 'Wohnungsbau GmbH', 'Miete / Wohnen'),
  tx('2024-01-03', 1900, 'Arbeitgeber GmbH', 'Gehalt / Lohn'),
  tx('2024-01-07', -12.99, 'Netflix', 'Abos / Streaming'),
  tx('2024-01-15', -400, 'REWE', 'Lebensmittel'),
  tx('2024-01-28', -6.5, 'Abschluss Dispozinsen', 'Dispozinsen / Kontoführung'),
  tx('2024-02-01', -650, 'Wohnungsbau GmbH', 'Miete / Wohnen'),
  tx('2024-02-02', 1900, 'Arbeitgeber GmbH', 'Gehalt / Lohn'),
  tx('2024-02-07', -12.99, 'Netflix', 'Abos / Streaming'),
  tx('2024-02-15', -900, 'Amazon', 'Online-Shopping'),
  tx('2024-02-20', -700, 'REWE', 'Lebensmittel'),
  tx('2024-03-01', -650, 'Wohnungsbau GmbH', 'Miete / Wohnen'),
  tx('2024-03-04', 1900, 'Arbeitgeber GmbH', 'Gehalt / Lohn'),
  tx('2024-03-07', -12.99, 'Netflix', 'Abos / Streaming'),
  tx('2024-03-15', -350, 'REWE', 'Lebensmittel'),
  tx('2024-03-16', -39.9, 'Rücklastschrift Fitness', 'Rücklastschrift / Mahngebühr', { buchungsart: 'Rücklastschrift' }),
  tx('2024-04-01', -650, 'Wohnungsbau GmbH', 'Miete / Wohnen'),
  tx('2024-04-02', 1900, 'Arbeitgeber GmbH', 'Gehalt / Lohn'),
]

describe('Kategorisierung', () => {
  it('ordnet anhand von Schlagworten zu, höhere Priorität gewinnt', () => {
    expect(categorize({ buchungsart: 'Lastschrift', gegenpartei: 'Netflix International', text: 'Abo', betrag: -12.99 }, rules, lookup)).toBe(catId('Abos / Streaming'))
    expect(categorize({ buchungsart: 'Abschluss', gegenpartei: '', text: 'Sollzinsen Dispositionskredit', betrag: -6.5 }, rules, lookup)).toBe(catId('Dispozinsen / Kontoführung'))
    expect(categorize({ buchungsart: 'Lastschrift', gegenpartei: 'PayPal Europe', text: 'Klarna Ratenkauf', betrag: -29.99 }, rules, lookup)).toBe(catId('Ratenkauf / Buy-now-pay-later'))
  })

  it('behandelt positive Beträge bei Ausgaben-Kategorien als Einnahme (Erstattung)', () => {
    expect(categorize({ buchungsart: 'Gutschrift', gegenpartei: 'Amazon EU', text: 'Rückerstattung', betrag: 25 }, rules, lookup)).toBe(catId('Sonstige Einnahmen'))
  })

  it('fällt auf Sonstiges zurück', () => {
    expect(categorize({ buchungsart: 'Lastschrift', gegenpartei: 'XYZ Unbekannt', text: '', betrag: -5 }, rules, lookup)).toBe(catId('Sonstiges'))
  })
})

describe('Wiederkehrende Buchungen', () => {
  const rec = detectRecurring(sample, { referenceDate: '2024-04-05' })

  it('erkennt Miete, Gehalt und Netflix als monatlich', () => {
    const names = rec.map((r) => r.name)
    expect(names).toContain('Wohnungsbau GmbH')
    expect(names).toContain('Arbeitgeber GmbH')
    expect(names).toContain('Netflix')
    expect(names).not.toContain('REWE') // unregelmäßige Beträge/Abstände
    expect(rec.every((r) => r.intervall === 'monatlich')).toBe(true)
  })

  it('berechnet monatliche Fixkosten', () => {
    expect(monthlyFixedCosts(rec)).toBeCloseTo(-662.99, 2)
  })

  it('setzt erwarteten Tag und Aktivität', () => {
    const miete = rec.find((r) => r.name === 'Wohnungsbau GmbH')!
    expect(miete.erwarteterTag).toBe(1)
    expect(miete.aktiv).toBe(true)
    const netflix = rec.find((r) => r.name === 'Netflix')!
    expect(netflix.aktiv).toBe(true) // 07.03. → 05.04. liegt innerhalb 1,6 Intervalle
  })
})

describe('Monatsbilanz und Kategorien', () => {
  it('fasst Monate zusammen und markiert Defizite', () => {
    const months = summarizeMonths(sample, categories)
    expect(months.map((m) => m.monat)).toEqual(['2024-01', '2024-02', '2024-03', '2024-04'])
    const feb = months[1]
    expect(feb.defizit).toBe(true)
    expect(feb.ausgaben).toBeCloseTo(2262.99, 2)
    expect(months[0].schulden).toBeCloseTo(6.5, 2)
  })

  it('rankt Kategorien nach Summe mit Anteil', () => {
    const totals = totalsByCategory(sample, categories)
    expect(totals[0].name).toBe('Miete / Wohnen')
    expect(totals.reduce((s, t) => s + t.anteil, 0)).toBeCloseTo(1, 5)
  })
})

describe('Saldoverlauf', () => {
  const txs = [tx('2024-03-01', -100, 'A'), tx('2024-03-05', 50, 'B'), tx('2024-03-10', -200, 'C')]

  it('rekonstruiert rückwärts und vorwärts vom Anker', () => {
    // Kontostand am 05.03. (Tagesende) = 20 → 01.03.: -30, 10.03.: -180
    const series = buildBalanceSeries(txs, [{ datum: '2024-03-05', saldo: 20 }])
    expect(series).toEqual([
      { datum: '2024-03-01', saldo: -30 },
      { datum: '2024-03-05', saldo: 20 },
      { datum: '2024-03-10', saldo: -180 },
    ])
  })

  it('zählt Tage im Minus und Episoden', () => {
    const series = buildBalanceSeries(txs, [{ datum: '2024-03-05', saldo: 20 }])
    const { tageImMinus, episoden, tiefstand } = negativeEpisodes(series, txs, categories, '2024-03-31')
    expect(episoden).toHaveLength(2)
    expect(tiefstand?.saldo).toBe(-180)
    expect(tageImMinus).toBe(4 + 21)
  })
})

describe('Schuldenanalyse gesamt', () => {
  it('liefert Findings zu Defizit, Schuldenkosten und Rücklastschrift', () => {
    const rec = detectRecurring(sample, { referenceDate: '2024-04-05' })
    const a = analyzeDebt(sample, categories, [{ datum: '2024-04-02', saldo: 800 }], rec, '2024-04-05')
    expect(a.schuldenkosten.gesamt).toBeCloseTo(46.4, 2)
    expect(a.ruecklastschriften).toBe(1)
    expect(a.findings.some((f) => f.titel.includes('Rücklastschrift'))).toBe(true)
    expect(a.findings.some((f) => f.titel.includes('mehr ausgegeben'))).toBe(true)
    expect(a.fixkostenQuote).toBeGreaterThan(0.3)
  })
})

describe('Budget', () => {
  it('bestimmt den Budgetmonat', () => {
    expect(budgetPeriod('2024-04-15', 1)).toEqual({ von: '2024-04-01', bis: '2024-04-30' })
    expect(budgetPeriod('2024-04-15', 25)).toEqual({ von: '2024-03-25', bis: '2024-04-24' })
    expect(budgetPeriod('2024-04-27', 25)).toEqual({ von: '2024-04-25', bis: '2024-05-24' })
  })

  it('berechnet aktuellen Kontostand aus Anker plus Folgebuchungen', () => {
    const settings = { ...DEFAULT_SETTINGS }
    const bal = currentBalance(sample, [{ datum: '2024-03-31', saldo: 500 }], settings)
    expect(bal?.saldo).toBe(500 - 650 + 1900)
    expect(bal?.quelle).toBe('auszug')
  })

  it('bevorzugt einen neueren manuellen Kontostand', () => {
    const settings = { ...DEFAULT_SETTINGS, kontostandManuell: 1234, kontostandManuellDatum: '2024-04-03' }
    const bal = currentBalance(sample, [{ datum: '2024-03-31', saldo: 500 }], settings)
    expect(bal?.saldo).toBe(1234)
    expect(bal?.quelle).toBe('manuell')
  })

  it('zieht noch nicht gebuchte Fixkosten und Puffer ab', () => {
    const rec = detectRecurring(sample, { referenceDate: '2024-04-05' })
    const settings = { ...DEFAULT_SETTINGS, sicherheitsPuffer: 100 }
    const b = computeBudget(sample, [{ datum: '2024-03-31', saldo: 500 }], rec, settings, '2024-04-05')
    // Kontostand 1750; Miete (01.04.) und Gehalt (02.04.) schon gebucht → nur Netflix offen
    expect(b.kontostand).toBe(1750)
    expect(b.ausstehend.map((p) => p.name)).toEqual(['Netflix'])
    expect(b.ausstehendeFixkosten).toBeCloseTo(-12.99, 2)
    expect(b.rechnerisch).toBeCloseTo(1750 - 12.99 - 100, 2)
    expect(b.freiVerfuegbar).toBeCloseTo(1637.01, 2)
    expect(b.tageVerbleibend).toBe(26)
    expect(b.tagesbudget).toBeCloseTo(1637.01 / 26, 2)
    expect(b.einnahmenBisher).toBe(1900)
    expect(b.ausgabenBisher).toBe(650)
  })

  it('begrenzt frei verfügbar auf 0 und warnt bei Dispo', () => {
    const rec = detectRecurring(sample, { referenceDate: '2024-04-05' })
    const b = computeBudget(sample, [{ datum: '2024-04-02', saldo: -300 }], rec, DEFAULT_SETTINGS, '2024-04-05')
    expect(b.freiVerfuegbar).toBe(0)
    expect(b.rechnerisch).toBeLessThan(0)
    expect(b.hinweise.some((h) => h.includes('Dispo'))).toBe(true)
  })

  it('weist auf fehlenden Kontostand hin', () => {
    const b = computeBudget(sample, [], [], DEFAULT_SETTINGS, '2024-04-05')
    expect(b.kontostand).toBeUndefined()
    expect(b.hinweise[0]).toMatch(/Kein Kontostand/)
  })
})
