import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseSparkasse, parseSparkasseText } from './sparkasse'
import type { TextLine } from './pdfText'
import { assignHashes, transactionHash } from './dedupe'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => readFileSync(join(here, '..', 'test', 'fixtures', name), 'utf8')

describe('Sparkasse-Parser – Kennzeichen-Variante (S/H)', () => {
  const result = parseSparkasseText(fixture('sparkasse-kennzeichen.txt'))

  it('erkennt Layout und Zeitraum', () => {
    expect(result.layout).toBe('kennzeichen')
    expect(result.zeitraumVon).toBe('2024-02-29')
    expect(result.zeitraumBis).toBe('2024-03-31')
    expect(result.startKontostand).toBe(-312.45)
    expect(result.endKontostand).toBe(760.69)
    expect(result.dispoLimit).toBe(1000)
  })

  it('erkennt alle Buchungen mit korrektem Vorzeichen', () => {
    expect(result.transactions).toHaveLength(9)
    const betraege = result.transactions.map((t) => t.betrag)
    expect(betraege).toEqual([-45.99, -650, 2100, -54.32, -12.99, -8.9, -39.9, -200, -14.76])
  })

  it('setzt das Jahr aus der Kopfzeile', () => {
    expect(result.transactions[0].buchungsdatum).toBe('2024-03-01')
    expect(result.transactions[8].buchungsdatum).toBe('2024-03-28')
  })

  it('extrahiert Buchungsart, Gegenpartei und Verwendungszweck', () => {
    const vodafone = result.transactions[0]
    expect(vodafone.buchungsart).toBe('Lastschrift Einzug')
    expect(vodafone.gegenpartei).toBe('Vodafone GmbH')
    expect(vodafone.text).toContain('Rechnung 03/2024')

    const rewe = result.transactions[3]
    expect(rewe.gegenpartei).toBe('REWE SAGT DANKE. 44')

    const gehalt = result.transactions[2]
    expect(gehalt.buchungsart).toBe('Lohn/Gehalt')
    expect(gehalt.gegenpartei).toBe('Arbeitgeber GmbH')
  })

  it('übersteht Seitenumbruch und Übertrag ohne Phantom-Buchungen', () => {
    expect(result.transactions.some((t) => /übertrag|seite/i.test(t.text))).toBe(false)
  })

  it('besteht die Summenprüfung ohne Warnung', () => {
    expect(result.warnings.filter((w) => w.startsWith('Summenprüfung'))).toHaveLength(0)
  })
})

describe('Sparkasse-Parser – Vorzeichen-Variante mit Valuta', () => {
  const result = parseSparkasseText(fixture('sparkasse-vorzeichen.txt'))

  it('erkennt Buchungen inkl. Betrag in Folgezeile', () => {
    expect(result.layout).toBe('vorzeichen')
    expect(result.transactions.map((t) => t.betrag)).toEqual([-89, 1950, -33.47, -29.99])
  })

  it('übernimmt Valuta-Datum', () => {
    const lidl = result.transactions[2]
    expect(lidl.buchungsdatum).toBe('2024-02-10')
    expect(lidl.valuta).toBe('2024-02-12')
    expect(lidl.gegenpartei).toBe('LIDL SAGT DANKE')
  })

  it('erkennt Kontostände ohne Kennzeichen als positiv', () => {
    expect(result.startKontostand).toBe(150)
    expect(result.endKontostand).toBe(1947.54)
    expect(result.warnings.filter((w) => w.startsWith('Summenprüfung'))).toHaveLength(0)
  })
})

describe('Sparkasse-Parser – Volldatum, Minus nur bei Ausgaben, Kredit-Detailzeilen', () => {
  const result = parseSparkasseText(fixture('sparkasse-volldatum.txt'))

  it('wertet vorzeichenlose Beträge als Einnahmen und Detailzeilen mit mehreren Beträgen nicht als Umsatz', () => {
    expect(result.layout).toBe('vorzeichen')
    expect(result.transactions.map((t) => t.betrag)).toEqual([-650, -24.39, -50, -23.45, -100, 2400, 12])
    expect(result.transactions.every((t) => !t.vorzeichenUnsicher)).toBe(true)
    expect(result.warnings.filter((w) => w.startsWith('Summenprüfung'))).toHaveLength(0)
  })

  it('hängt die Kredit-Detailzeile an die Darlehensbuchung an', () => {
    const kredit = result.transactions[1]
    expect(kredit.text).toContain('Tilgung 200,00 Zinsen 24,39')
    expect(kredit.gegenpartei).toBe('ABC Bank AG Darlehen 1234567890')
  })

  it('erkennt unbekannte, kurze Buchungsarten', () => {
    expect(result.transactions[4].buchungsart).toBe('Sonst. Buchung')
    expect(result.transactions[5].buchungsart).toBe('Lohn-/Gehaltsgutschrift')
    expect(result.transactions[6].buchungsart).toBe('SB-Einzug Gutschr.')
    expect(result.transactions[6].gegenpartei).toBe('Rückzahlung Pfand')
  })

  it('liest Dispolimit und Jahr aus der Kopfzeile', () => {
    expect(result.dispoLimit).toBe(1500)
    expect(result.zeitraumVon).toBe('2026-07-31')
    expect(result.endKontostand).toBe(3739.37)
  })
})

describe('Sparkasse-Parser – Jahreswechsel', () => {
  const result = parseSparkasseText(fixture('sparkasse-jahreswechsel.txt'))

  it('ordnet Dezember-Buchungen dem Vorjahr zu', () => {
    expect(result.transactions.map((t) => t.buchungsdatum)).toEqual(['2023-12-29', '2024-01-02'])
    expect(result.warnings.filter((w) => w.startsWith('Summenprüfung'))).toHaveLength(0)
  })
})

describe('Sparkasse-Parser – Soll/Haben-Spalten', () => {
  const line = (page: number, y: number, spans: Array<[number, string]>): TextLine => ({
    page,
    y,
    spans: spans.map(([x, str]) => ({ x, x2: x + str.length * 5, str })),
    text: spans.map((s) => s[1]).join(' '),
  })
  const lines: TextLine[] = [
    line(1, 800, [[40, 'Kontoauszug 5/2024']]),
    line(1, 780, [[40, 'Buchung'], [80, 'Valuta'], [120, 'Vorgang/Buchungsinformation'], [400, 'Soll'], [500, 'Haben']]),
    line(1, 760, [[120, 'Kontostand am 30.04.2024'], [505, '500,00']]),
    line(1, 740, [[40, '02.05.'], [80, '02.05.'], [120, 'Lastschrift'], [405, '120,00']]),
    line(1, 725, [[120, 'HUK-COBURG Versicherung']]),
    line(1, 710, [[40, '03.05.'], [80, '03.05.'], [120, 'Gutschrift'], [500, '1.000,00']]),
    line(1, 695, [[120, 'Familienkasse Kindergeld']]),
    line(1, 680, [[120, 'Kontostand am 31.05.2024'], [500, '1.380,00']]),
  ]
  const result = parseSparkasse(lines)

  it('bestimmt das Vorzeichen anhand der Spaltenposition', () => {
    expect(result.layout).toBe('soll-haben-spalten')
    expect(result.transactions.map((t) => t.betrag)).toEqual([-120, 1000])
    expect(result.transactions[0].gegenpartei).toBe('HUK-COBURG Versicherung')
    expect(result.endKontostand).toBe(1380)
    expect(result.warnings.filter((w) => w.startsWith('Summenprüfung'))).toHaveLength(0)
  })
})

describe('Sparkasse-Parser – Robustheit', () => {
  it('warnt bei leerem Dokument', () => {
    const result = parseSparkasseText('Sparkasse Musterstadt\nKontoauszug 1/2024\n')
    expect(result.transactions).toHaveLength(0)
    expect(result.warnings[0]).toMatch(/Keine Buchungen/)
  })

  it('behandelt Datumsangaben im Verwendungszweck nicht als neue Buchung', () => {
    const text = [
      'Kontoauszug 4/2024',
      'Kontostand am 31.03.2024 100,00 H',
      '02.04. Lastschrift 25,00 S',
      'Stadtwerke',
      '15.03.2024 Ablesung Zählerstand 4711',
      'Kontostand am 30.04.2024 75,00 H',
    ].join('\n')
    const result = parseSparkasseText(text)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].text).toContain('Ablesung')
  })

  it('rät das Vorzeichen anhand der Buchungsart, wenn kein Kennzeichen vorhanden ist', () => {
    const text = ['Kontoauszug 4/2024', '02.04. Lastschrift 25,00', 'Test', '03.04. Gutschrift 50,00', 'Test2'].join('\n')
    const result = parseSparkasseText(text)
    expect(result.transactions.map((t) => t.betrag)).toEqual([-25, 50])
    expect(result.transactions.every((t) => !t.vorzeichenUnsicher)).toBe(true)
  })
})

describe('Dedupe', () => {
  it('erzeugt gleiche Hashes für gleiche Buchungen unabhängig von Whitespace/Groß-Kleinschreibung', () => {
    const a = transactionHash({ buchungsdatum: '2024-03-01', betrag: -45.99, text: 'Vodafone GmbH  Rechnung' })
    const b = transactionHash({ buchungsdatum: '2024-03-01', betrag: -45.99, text: 'vodafone gmbh rechnung' })
    expect(a).toBe(b)
  })

  it('unterscheidet identische Buchungen am selben Tag per Zähler', () => {
    const items = assignHashes([
      { buchungsdatum: '2024-03-01', betrag: -2.5, text: 'Bäcker' },
      { buchungsdatum: '2024-03-01', betrag: -2.5, text: 'Bäcker' },
    ])
    expect(items[0].hash).not.toBe(items[1].hash)
    expect(items[1].hash.endsWith('-1')).toBe(true)
  })
})
