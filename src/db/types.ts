export type CategoryType = 'fix' | 'variabel' | 'einkommen' | 'schulden' | 'sonstiges'

export interface Category {
  id?: number
  name: string
  typ: CategoryType
  farbe: string
  /** Systemkategorie, kann nicht gelöscht werden */
  system?: boolean
}

export interface Rule {
  id?: number
  /** Schlagwort, wird case-insensitiv im Buchungstext gesucht */
  schlagwort: string
  kategorieId: number
  /** höhere Priorität gewinnt bei mehreren Treffern */
  prioritaet: number
}

export type TransactionSource = 'pdf' | 'manuell'

export interface Transaction {
  id?: number
  /** Duplikat-Hash aus Datum + Betrag + normalisiertem Text */
  hash: string
  /** ISO-Datum yyyy-mm-dd */
  buchungsdatum: string
  /** ISO-Datum yyyy-mm-dd (Wertstellung) */
  valuta: string
  /** Buchungsart, z.B. "Lastschrift", "Gutschrift", "Kartenzahlung" */
  buchungsart: string
  /** vollständiger Verwendungszweck */
  text: string
  /** erkannte Gegenpartei (erste Zeile des Textes o. ä.) */
  gegenpartei: string
  /** negativ = Ausgabe, positiv = Einnahme */
  betrag: number
  kategorieId?: number
  /** true, wenn die Kategorie vom Nutzer gesetzt wurde (wird bei Neu-Kategorisierung nicht überschrieben) */
  kategorieManuell?: boolean
  quelle: TransactionSource
  statementId?: number
}

export interface BalancePoint {
  /** ISO-Datum */
  datum: string
  saldo: number
}

export interface Statement {
  id?: number
  dateiname: string
  importDatum: string
  zeitraumVon?: string
  zeitraumBis?: string
  startKontostand?: number
  endKontostand?: number
  anzahlBuchungen: number
  rohtext: string
}

export interface Settings {
  id: 'main'
  /** manuell gesetzter aktueller Kontostand (überschreibt PDF) */
  kontostandManuell?: number
  /** Datum, zu dem der manuelle Kontostand gilt (ISO) */
  kontostandManuellDatum?: string
  dispoLimit: number
  sicherheitsPuffer: number
  /** Tag im Monat, an dem der "Budgetmonat" beginnt (1 = Kalendermonat) */
  monatsStart: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  dispoLimit: 0,
  sicherheitsPuffer: 0,
  monatsStart: 1,
}
