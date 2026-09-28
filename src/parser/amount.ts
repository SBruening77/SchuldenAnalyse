/** Deutsches Betragsformat: 1.234,56 – mit optionalem Vorzeichen bzw. S/H-Kennzeichen. */
export const AMOUNT_CORE = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`

/**
 * Betrag am Zeilenende, inkl. Vorzeichen davor oder Kennzeichen (S/H/+/-) dahinter.
 * Bewusst ohne Lookbehind (Kompatibilität mit älteren iOS-Safari-Versionen).
 */
export const AMOUNT_END_RE = new RegExp(String.raw`(?:^|\s)([-+]?)\s?(${AMOUNT_CORE})\s?([-+SH])?\s*$`)

/** Zeile besteht nur aus einem Betrag */
export const AMOUNT_ONLY_RE = new RegExp(String.raw`^([-+]?)\s?(${AMOUNT_CORE})\s?([-+SH])?$`)

export function parseGermanNumber(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

export interface AmountMatch {
  /** Betrag als positive Zahl */
  abs: number
  /** -1, +1 oder 0 wenn unbekannt */
  sign: -1 | 1 | 0
  /** Zeile ohne den Betragsteil */
  rest: string
}

export function signFromMarkers(pre: string | undefined, post: string | undefined): -1 | 1 | 0 {
  if (pre === '-' || post === '-' || post === 'S') return -1
  if (pre === '+' || post === '+' || post === 'H') return 1
  return 0
}

export function matchAmountAtEnd(line: string): AmountMatch | null {
  const m = AMOUNT_END_RE.exec(line)
  if (!m) return null
  const [, pre, num, post] = m
  return {
    abs: parseGermanNumber(num),
    sign: signFromMarkers(pre, post),
    rest: line.slice(0, m.index).trim(),
  }
}

export function formatIsoDate(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
