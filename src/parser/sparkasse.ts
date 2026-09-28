/**
 * Parser für Sparkasse-Kontoauszüge (PDF-Text).
 *
 * Unterstützte Layout-Varianten:
 *  - Klassischer Kontoauszug: "dd.mm.  Buchungsart   1.234,56 S|H", Verwendungszweck in Folgezeilen
 *  - Vorzeichen-Variante:     "dd.mm.yyyy dd.mm.yyyy Buchungstext   -1.234,56"
 *  - Soll/Haben-Spalten:      Betrag ohne Kennzeichen, Vorzeichen anhand der X-Position der Spalte
 *
 * Kontostand-Zeilen ("Kontostand am dd.mm.yyyy ... 1.234,56 H") werden als Saldo-Punkte erkannt.
 */
import type { TextLine, TextSpan } from './pdfText'
import type { ParsedStatement, ParsedTransaction } from './types'
import { AMOUNT_ONLY_RE, formatIsoDate, matchAmountAtEnd, parseGermanNumber, signFromMarkers } from './amount'

const DATE_START_RE = /^(\d{2})\.(\d{2})\.(\d{4})?\s*(?:(\d{2})\.(\d{2})\.(\d{4})?(?:\s+|$))?/
const FULL_DATE_G_RE = /(\d{2})\.(\d{2})\.(\d{4})/g
const BALANCE_CANDIDATE_RE = /kontostand|^(?:neuer|alter|end|anfangs)?\s*saldo\b/i
const UEBERTRAG_RE = /^(?:übertrag|uebertrag|zwischensumme)\b/i

/** Zeilen, die niemals Buchungen oder Verwendungszweck sind (Seitenkopf/-fuß, Tabellenkopf) */
const NOISE_RE = new RegExp(
  [
    String.raw`^seite\s+\d+`,
    String.raw`^blatt\s+\d+`,
    String.raw`^\d+\s*/\s*\d+$`,
    String.raw`^kontoauszug\b`,
    String.raw`^auszug\s*(?:nr\.?)?\s*\d+`,
    String.raw`^iban\b`,
    String.raw`^bic\b`,
    String.raw`^kontonummer\b`,
    String.raw`^konto-?nr\b`,
    String.raw`^blz\b`,
    String.raw`^bankleitzahl\b`,
    String.raw`^kundennummer\b`,
    String.raw`^erstellt am\b`,
    String.raw`^datum\s+erl[äa]uterung`,
    String.raw`^buchung\s+valuta`,
    String.raw`^buchungstag\b`,
    String.raw`^bu-tag\b`,
    String.raw`^wert\s+vorgang`,
    String.raw`^vorgang\s*/`,
    String.raw`^(?:soll|haben)\s*(?:\(?eur\)?)?$`,
    String.raw`^betrag\s*(?:in\s*)?(?:\(?eur\)?)?$`,
    String.raw`^(?:stadt|kreis|landes|bezirks)?sparkasse(?:\s+[A-Za-zÄÖÜäöüß.-]+){0,3}$`,
    String.raw`^naspa(?:\s+\S+)?$`,
    String.raw`^(?:privat)?girokonto(?:\s+\S+){0,2}$`,
    String.raw`^bitte beachten`,
    String.raw`^wichtige\s+(?:hinweise|information)`,
    String.raw`^einlagen\s+sind`,
    String.raw`^die\s+einlagen`,
    String.raw`^rechnungsabschluss\b`,
    String.raw`^telefon(?:nummer)?\s*[:.]?\s*[\d+(]`,
    String.raw`^e-?mail\s*[:.]`,
    String.raw`^www\.`,
    String.raw`^https?://`,
    String.raw`^vorstand\b`,
    String.raw`^sitz\s+der\b`,
    String.raw`^handelsregister`,
    String.raw`^ust-?id`,
  ].join('|'),
  'i',
)

/** Typische Buchungsarten der Sparkasse (Erkennung der Buchungsart in der ersten Zeile) */
const BOOKING_TYPES = [
  'lastschrift',
  'gutschrift',
  'überweisung',
  'ueberweisung',
  'dauerauftrag',
  'kartenzahlung',
  'kartenverfügung',
  'kartenverfuegung',
  'bargeldauszahlung',
  'bargeldeinzahlung',
  'entgeltabrechnung',
  'entgelt',
  'abschluss',
  'zinsen',
  'lohn',
  'gehalt',
  'rente',
  'echtzeit-überweisung',
  'echtzeitüberweisung',
  'online-überweisung',
  'sepa-überweisung',
  'sepa-lastschrift',
  'basislastschrift',
  'folgelastschrift',
  'erstlastschrift',
  'rücklastschrift',
  'ruecklastschrift',
  'retoure',
  'storno',
  'geldautomat',
  'auszahlung',
  'einzahlung',
  'scheck',
  'sonstige',
  'umbuchung',
  'sammler',
  'sammelüberweisung',
  'sammellastschrift',
  'kreditkartenabrechnung',
  'abrechnung',
]

export interface SparkasseParseOptions {
  /** Jahr, falls keines im Dokument gefunden wird */
  fallbackYear?: number
}

interface ColumnLayout {
  /** X-Grenze: Beträge mit rechter Kante links davon gelten als Soll */
  sollHabenBoundary: number
}

/** Hilfsstruktur für den Aufbau einer Buchung über mehrere Zeilen */
interface Pending {
  day: number
  month: number
  year?: number
  valutaDay?: number
  valutaMonth?: number
  valutaYear?: number
  firstLine: string
  lines: string[]
  abs?: number
  sign: -1 | 1 | 0
}

interface Balance {
  datum: string
  saldo: number
}

export function parseSparkasse(lines: TextLine[], opts: SparkasseParseOptions = {}): ParsedStatement {
  const warnings: string[] = []
  const balances: Balance[] = []
  const transactions: ParsedTransaction[] = []
  let layout: ParsedStatement['layout'] = 'unbekannt'
  let column: ColumnLayout | null = null
  let dispoLimit: number | undefined

  // ---------- 1. Jahr ermitteln ----------
  const fullYears: number[] = []
  for (const l of lines) {
    for (const m of l.text.matchAll(FULL_DATE_G_RE)) fullYears.push(Number(m[3]))
  }
  const year =
    detectStatementYear(lines) ??
    (fullYears.length ? mostCommon(fullYears) : undefined) ??
    opts.fallbackYear ??
    new Date().getFullYear()

  // ---------- 2. Spaltenlayout (Soll/Haben) ermitteln ----------
  for (const l of lines) {
    const soll = l.spans.find((s) => /^soll\b/i.test(s.str.trim()))
    const haben = l.spans.find((s) => /^haben\b/i.test(s.str.trim()))
    if (soll && haben && haben.x > soll.x) {
      column = { sollHabenBoundary: (soll.x2 + haben.x) / 2 }
      layout = 'soll-haben-spalten'
      break
    }
  }

  // ---------- 2b. Vorzeichen-Konvention des Dokuments ermitteln ----------
  // Viele Sparkassen-Auszüge schreiben Ausgaben als "-123,45" und Einnahmen OHNE Vorzeichen.
  // Wenn im Dokument Vorzeichen (aber keine S/H-Kennzeichen) vorkommen, gelten vorzeichenlose Beträge als Einnahmen.
  let signMode: 'kennzeichen' | 'vorzeichen' | 'unbekannt' = 'unbekannt'
  {
    let sh = 0
    let signed = 0
    for (const l of lines) {
      const m = matchAmountAtEnd(l.text.trim())
      if (!m) continue
      if (/\d\s?[SH]$/.test(l.text.trim())) sh++
      else if (m.sign !== 0) signed++
    }
    if (sh > 0) signMode = 'kennzeichen'
    else if (signed >= 2) signMode = 'vorzeichen'
  }
  if (!column && signMode !== 'unbekannt') layout = signMode

  // ---------- 3. Zeilen durchlaufen ----------
  let pending: Pending | null = null
  const flush = () => {
    if (!pending) return
    const tx = finalizePending(pending, year, balances, signMode)
    if (tx) transactions.push(tx)
    pending = null
  }

  for (const line of lines) {
    const text = line.text.trim()
    if (!text) continue

    // Dispolimit-Hinweis (z. B. "Eingeräumte Kontoüberziehung 1.000,00 EUR")
    if (dispoLimit === undefined && /dispositionskredit|kontoüberziehung|kontoueberziehung|kreditlimit|dispo\b/i.test(text)) {
      const m = matchAmountAtEnd(text.replace(/\s*EUR\s*$/i, ''))
      if (m && m.abs > 0) dispoLimit = m.abs
    }

    // Kontostand-Zeilen (nur wenn Datum + Betrag erkennbar)
    if (BALANCE_CANDIDATE_RE.test(text)) {
      const bal = parseBalanceLine(text, line.spans, column, year)
      if (bal) {
        flush()
        balances.push(bal)
        continue
      }
    }

    if (UEBERTRAG_RE.test(text)) {
      flush()
      continue
    }

    // Seitenkopf/-fuß: laufende Buchung bleibt offen (Folgezeilen können auf der nächsten Seite stehen)
    if (NOISE_RE.test(text)) continue

    const dateMatch = DATE_START_RE.exec(text)
    if (dateMatch && isValidDayMonth(Number(dateMatch[1]), Number(dateMatch[2]))) {
      const day = Number(dateMatch[1])
      const month = Number(dateMatch[2])
      const rest = text.slice(dateMatch[0].length).trim()
      const amountCount = countAmounts(rest)
      // Detailzeilen wie "dd.mm.yyyy Saldo: 12.345,67- Tilgung 200,00 Zinsen 24,39" enthalten mehrere Beträge → kein Umsatz
      const amt = amountCount === 1 ? matchAmountAtEnd(rest) : null
      const typeLike = looksLikeBookingType(amt ? amt.rest : rest)
      const hasValuta = dateMatch[4] !== undefined
      let isNew: boolean
      if (amountCount > 1) isNew = false
      else if (amt) {
        // vorzeichenloser Betrag in einem Dokument mit Vorzeichen-Konvention: nur mit Buchungsart/Valuta als Umsatz werten
        isNew = amt.sign !== 0 || !!column || signMode !== 'vorzeichen' || typeLike || hasValuta || !pending
      } else {
        isNew = typeLike || hasValuta || !pending
      }
      if (isNew) {
        flush()
        let sign: -1 | 1 | 0 = amt?.sign ?? 0
        if (amt && sign === 0 && column) sign = signFromColumn(line.spans, column)
        pending = {
          day,
          month,
          year: dateMatch[3] ? Number(dateMatch[3]) : undefined,
          valutaDay: dateMatch[4] ? Number(dateMatch[4]) : undefined,
          valutaMonth: dateMatch[5] ? Number(dateMatch[5]) : undefined,
          valutaYear: dateMatch[6] ? Number(dateMatch[6]) : undefined,
          firstLine: amt ? amt.rest : rest,
          lines: [],
          abs: amt?.abs,
          sign,
        }
        if (amt && layout === 'unbekannt') {
          layout = /\d\s?[SH]$/.test(rest) ? 'kennzeichen' : 'vorzeichen'
        }
        continue
      }
    }

    // Folgezeile
    if (pending) {
      if (pending.abs === undefined) {
        const only = AMOUNT_ONLY_RE.exec(text)
        if (only) {
          pending.abs = parseGermanNumber(only[2])
          pending.sign = signFromMarkers(only[1], only[3])
          if (pending.sign === 0 && column) pending.sign = signFromColumn(line.spans, column)
          continue
        }
      }
      pending.lines.push(text)
    }
  }
  flush()

  // ---------- 4. Zeitraum / Kontostände / Warnungen ----------
  balances.sort((a, b) => a.datum.localeCompare(b.datum))
  transactions.sort((a, b) => a.buchungsdatum.localeCompare(b.buchungsdatum))
  const zeitraumVon = balances[0]?.datum ?? transactions[0]?.buchungsdatum
  const zeitraumBis = balances[balances.length - 1]?.datum ?? transactions[transactions.length - 1]?.buchungsdatum

  if (transactions.length === 0) {
    warnings.push(
      'Keine Buchungen erkannt. Bitte Rohtext prüfen – ggf. ist das PDF gescannt oder hat ein unbekanntes Layout.',
    )
  }
  const unsicher = transactions.filter((t) => t.vorzeichenUnsicher).length
  if (unsicher > 0) {
    warnings.push(`${unsicher} Buchung(en) ohne eindeutiges Vorzeichen – bitte in der Vorschau prüfen.`)
  }

  if (balances.length >= 2 && transactions.length > 0) {
    const sum = transactions.reduce((s, t) => s + t.betrag, 0)
    const expected = round2(balances[0].saldo + sum)
    const actual = balances[balances.length - 1].saldo
    const diff = Math.abs(expected - actual)
    if (diff > 0.005) {
      warnings.push(
        `Summenprüfung: Anfangssaldo + Buchungen = ${expected.toFixed(2)} €, Endsaldo laut Auszug ${actual.toFixed(2)} € (Differenz ${diff.toFixed(2)} €). Möglicherweise wurden Buchungen nicht erkannt.`,
      )
    }
  }

  return {
    transactions,
    balances,
    zeitraumVon,
    zeitraumBis,
    startKontostand: balances[0]?.saldo,
    endKontostand: balances[balances.length - 1]?.saldo,
    dispoLimit,
    warnings,
    layout,
  }
}

/** Komfortfunktion: reiner Text ohne Positionsdaten (z. B. für Tests oder Einfügen aus der Zwischenablage) */
export function parseSparkasseText(text: string, opts?: SparkasseParseOptions): ParsedStatement {
  const lines: TextLine[] = text.split(/\r?\n/).map((t, i) => ({
    page: 1,
    y: -i,
    spans: [{ x: 0, x2: t.length, str: t }],
    text: t.trim(),
  }))
  return parseSparkasse(lines, opts)
}

// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isValidDayMonth(d: number, m: number): boolean {
  return d >= 1 && d <= 31 && m >= 1 && m <= 12
}

function mostCommon(nums: number[]): number | undefined {
  const counts = new Map<number, number>()
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1)
  let best: number | undefined
  let bestCount = 0
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n
      bestCount = c
    }
  }
  return best
}

const AMOUNT_ANY_RE = new RegExp(String.raw`(?:^|[\s:])[-+]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}[-+]?(?=\s|$)`, 'g')

/** Anzahl der Beträge (deutsches Format) in einer Zeile */
function countAmounts(s: string): number {
  return (s.match(AMOUNT_ANY_RE) ?? []).length
}

/**
 * Sieht der Text nach einer Buchungsart aus? Entweder beginnt/enthält er einen bekannten Typ,
 * oder er ist kurz, ohne Ziffern und mit höchstens drei Wörtern (z. B. "Sonst. Buchung", "SB-Einzug Gutschr.").
 */
function looksLikeBookingType(rest: string): boolean {
  const t = rest.trim()
  if (!t) return false
  const lower = t.toLowerCase()
  if (BOOKING_TYPES.some((b) => lower.startsWith(b))) return true
  if (t.length <= 40 && !/\d/.test(t) && BOOKING_TYPES.some((b) => lower.includes(b))) return true
  return t.length <= 32 && !/\d/.test(t) && t.split(/\s+/).length <= 3 && /[a-zäöü]/i.test(t)
}

/** Jahr aus Kopfzeilen wie "Kontoauszug 3/2024", "Auszug Nr. 3 / 2024" oder "Kontostand am 31.03.2024" */
function detectStatementYear(lines: TextLine[]): number | undefined {
  const patterns = [
    /kontoauszug\s+(?:nr\.?\s*)?\d{1,3}\s*\/\s*(\d{4})/i,
    /auszug\s*(?:nr\.?)?\s*\d{1,3}\s*\/\s*(\d{4})/i,
    /kontostand\s+(?:am|vom|per|zum)\s+\d{2}\.\d{2}\.(\d{4})/i,
    /(?:kontoauszug|auszug|erstellt)\s+(?:vom|am)\s+\d{2}\.\d{2}\.(\d{4})/i,
  ]
  for (const l of lines) {
    for (const p of patterns) {
      const m = p.exec(l.text)
      if (m) return Number(m[1])
    }
  }
  return undefined
}

function signFromColumn(spans: TextSpan[], column: ColumnLayout): -1 | 1 | 0 {
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i]
    if (/\d,\d{2}\s*[-+SH]?\s*$/.test(s.str.trim())) {
      return s.x2 <= column.sollHabenBoundary ? -1 : 1
    }
  }
  return 0
}

function parseBalanceLine(text: string, spans: TextSpan[], column: ColumnLayout | null, year: number): Balance | null {
  const cleaned = text.replace(/\s*EUR\s*$/i, '').trim()
  const amt = matchAmountAtEnd(cleaned)
  if (!amt) return null
  let sign = amt.sign
  if (sign === 0 && column) sign = signFromColumn(spans, column)
  if (sign === 0) sign = 1 // Kontostand ohne Kennzeichen → positiv annehmen

  let d = /(?:am|vom|per|zum)\s+(\d{2})\.(\d{2})\.(\d{4})?/i.exec(cleaned)
  if (!d) d = /(\d{2})\.(\d{2})\.(\d{4})?/.exec(cleaned)
  if (!d) return null
  const day = Number(d[1])
  const month = Number(d[2])
  const y = d[3] ? Number(d[3]) : year
  if (!isValidDayMonth(day, month)) return null
  return { datum: formatIsoDate(day, month, y), saldo: sign * amt.abs }
}

const NEGATIVE_HINTS =
  /lastschrift|kartenzahlung|kartenverf|entgelt|abschluss|dauerauftrag|bargeldauszahlung|auszahlung|geldautomat|zinsen|gebühr|gebuehr|überweisung|ueberweisung|rücklastschrift|ruecklastschrift|retoure|abrechnung/i
const POSITIVE_HINTS = /gutschrift|lohn|gehalt|rente|einzahlung|erstattung|storno|kindergeld|bürgergeld/i

function finalizePending(
  p: Pending,
  statementYear: number,
  balances: Balance[],
  signMode: 'kennzeichen' | 'vorzeichen' | 'unbekannt',
): ParsedTransaction | null {
  if (p.abs === undefined) return null // Datumszeile ohne Betrag: kein Umsatz

  const y = p.year ?? guessYear(p.day, p.month, statementYear, balances)
  const buchungsdatum = formatIsoDate(p.day, p.month, y)
  const valuta =
    p.valutaDay && p.valutaMonth && isValidDayMonth(p.valutaDay, p.valutaMonth)
      ? formatIsoDate(p.valutaDay, p.valutaMonth, p.valutaYear ?? guessYear(p.valutaDay, p.valutaMonth, y, balances))
      : buchungsdatum

  // Buchungsart vs. restlicher Text der ersten Zeile
  let buchungsart = ''
  let firstRest = p.firstLine.trim()
  const lowerFirst = firstRest.toLowerCase()
  const typeHit = BOOKING_TYPES.filter((t) => lowerFirst.startsWith(t)).sort((a, b) => b.length - a.length)[0]
  if (typeHit && firstRest.length > 40) {
    // "Lastschrift Vodafone GmbH Mandat ..." → Art = erstes Wort/Wörter, Rest = Verwendungszweck
    const m = /^(\S+(?:\s+(?:einzug|eingang|ausgang|online|girocard|sepa|echtzeit))?)\s+/i.exec(firstRest)
    buchungsart = m ? m[1] : firstRest.slice(0, typeHit.length)
    firstRest = firstRest.slice(buchungsart.length).trim()
  } else if (looksLikeBookingType(firstRest)) {
    // kurze Zeile ohne Ziffern ("Lastschrift Einzug", "Sonst. Buchung", "Lohn-/Gehaltsgutschrift") → komplett Buchungsart
    buchungsart = firstRest
    firstRest = ''
  }

  const detailLines = [firstRest, ...p.lines].filter((l) => l.length > 0)
  const text = detailLines.join(' ').replace(/\s+/g, ' ').trim()
  const gegenpartei = pickCounterparty(detailLines, buchungsart)

  let sign = p.sign
  let vorzeichenUnsicher = false
  if (sign === 0) {
    const probe = buchungsart || text
    if (signMode === 'vorzeichen') {
      // Dokument schreibt Ausgaben mit "-": vorzeichenlos = Einnahme
      sign = 1
    } else if (POSITIVE_HINTS.test(probe)) sign = 1
    else if (NEGATIVE_HINTS.test(probe)) sign = -1
    else {
      sign = -1
      vorzeichenUnsicher = true
    }
  }

  return {
    buchungsdatum,
    valuta,
    buchungsart,
    gegenpartei,
    text,
    betrag: sign * p.abs,
    vorzeichenUnsicher: vorzeichenUnsicher || undefined,
  }
}

/** Jahr für "dd.mm."-Daten bestimmen, inkl. Jahreswechsel innerhalb des Auszugs */
function guessYear(day: number, month: number, statementYear: number, balances: Balance[]): number {
  if (balances.length === 0) return statementYear
  const start = balances[0].datum
  const end = balances[balances.length - 1].datum
  for (const y of [statementYear - 1, statementYear, statementYear + 1]) {
    const iso = formatIsoDate(day, month, y)
    if (iso >= shiftDays(start, -35) && iso <= shiftDays(end, 35)) return y
  }
  return statementYear
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return formatIsoDate(dt.getDate(), dt.getMonth() + 1, dt.getFullYear())
}

const REFERENCE_LINE_RE =
  /^(?:mandat|mandatsref|mref|cred|creditor|gläubiger|glaeubiger|kundenreferenz|kref|eref|end-to-end|iban|bic|svwz|abwa|purp|ref\.?|referenz|kartennummer|karte\s*\d|terminal|ta-?nr|folgenr|verwendungszweck|verfalld|kartenzahlung|siehe\s+anlage)\b/i
const IBAN_LIKE_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/

/** Gegenpartei: erste sinnvolle Zeile, die keine technische Referenz ist */
function pickCounterparty(detailLines: string[], buchungsart: string): string {
  for (const raw of detailLines) {
    const l = raw.trim()
    if (!l) continue
    if (REFERENCE_LINE_RE.test(l)) continue
    if (IBAN_LIKE_RE.test(l.replace(/\s/g, ''))) continue
    if (/^[\d\s.,:/-]+$/.test(l)) continue // nur Zahlen/Datum
    // Sparkasse hängt oft "Mandatsreferenz ... Gläubiger-ID ..." an die Namenszeile an
    const cut = l.split(
      /\s+(?:Mandat(?:sref(?:erenz)?)?|MREF|Gläubiger-?ID|Glaeubiger-?ID|CRED|EREF|KREF|SVWZ|End-to-End|Verwendungszweck)[\s:+]/i,
    )[0]
    // Kartenzahlungs-Details: "REWE SAGT DANKE. 44//Berlin/DE 2024-03-05T10:15" → vor "//" abschneiden
    const cleaned = cut.split(/\s*\/\//)[0].replace(/\s+\d{4}-\d{2}-\d{2}T.*$/, '')
    return cleaned.trim().slice(0, 80)
  }
  return buchungsart
}
