import type { BalancePoint } from '../db/types'

export interface ParsedTransaction {
  /** ISO yyyy-mm-dd */
  buchungsdatum: string
  valuta: string
  buchungsart: string
  gegenpartei: string
  text: string
  betrag: number
  /** true, wenn das Vorzeichen nur geraten werden konnte */
  vorzeichenUnsicher?: boolean
}

export interface ParsedStatement {
  transactions: ParsedTransaction[]
  balances: BalancePoint[]
  zeitraumVon?: string
  zeitraumBis?: string
  startKontostand?: number
  endKontostand?: number
  dispoLimit?: number
  warnings: string[]
  /** erkanntes Layout, für Debug-Anzeige */
  layout: 'soll-haben-spalten' | 'kennzeichen' | 'vorzeichen' | 'unbekannt'
}
