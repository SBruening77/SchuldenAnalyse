import { db, ensureDefaults, getSettings, updateSettings } from './schema'
import type { Category, Rule, Settings, Statement, Transaction } from './types'
import { applyCategories, buildCategoryLookup, categorize, keywordFromCounterparty } from '../categorize/rules'
import { assignHashes } from '../parser/dedupe'
import type { ParsedStatement } from '../parser/types'
import { todayIso } from '../lib/format'

export interface ImportPreviewItem {
  hash: string
  buchungsdatum: string
  valuta: string
  buchungsart: string
  gegenpartei: string
  text: string
  betrag: number
  kategorieId?: number
  duplikat: boolean
  vorzeichenUnsicher?: boolean
  /** vom Nutzer in der Vorschau abgewählt */
  ausgewaehlt: boolean
}

/**
 * Bereitet geparste Buchungen für die Vorschau auf: Hashes, Duplikate, Kategorien.
 * Mit `replaceStatementId` werden Buchungen dieses (zu ersetzenden) Imports nicht als Duplikat gewertet.
 */
export async function prepareImport(
  parsed: ParsedStatement,
  opts: { replaceStatementId?: number } = {},
): Promise<ImportPreviewItem[]> {
  const [rules, categories] = await Promise.all([db.rules.toArray(), db.categories.toArray()])
  const lookup = buildCategoryLookup(categories)
  const withHash = assignHashes(parsed.transactions)
  const existingTx = await db.transactions.where('hash').anyOf(withHash.map((t) => t.hash)).toArray()
  const existing = new Set(
    existingTx.filter((t) => opts.replaceStatementId === undefined || t.statementId !== opts.replaceStatementId).map((t) => t.hash),
  )
  return withHash.map((t) => {
    const duplikat = existing.has(t.hash)
    return {
      hash: t.hash,
      buchungsdatum: t.buchungsdatum,
      valuta: t.valuta,
      buchungsart: t.buchungsart,
      gegenpartei: t.gegenpartei,
      text: t.text,
      betrag: t.betrag,
      kategorieId: categorize(t, rules, lookup),
      duplikat,
      vorzeichenUnsicher: t.vorzeichenUnsicher,
      ausgewaehlt: !duplikat,
    }
  })
}

export async function commitImport(
  parsed: ParsedStatement,
  items: ImportPreviewItem[],
  meta: { dateiname: string; rohtext: string; replaceStatementId?: number },
): Promise<{ statementId: number; gespeichert: number }> {
  const selected = items.filter((i) => i.ausgewaehlt && !i.duplikat)
  const statementId = await db.transaction('rw', db.statements, db.transactions, db.settings, async () => {
    if (meta.replaceStatementId !== undefined) {
      await db.transactions.where('statementId').equals(meta.replaceStatementId).delete()
      await db.statements.delete(meta.replaceStatementId)
    }
    const statement: Statement = {
      dateiname: meta.dateiname,
      importDatum: new Date().toISOString(),
      zeitraumVon: parsed.zeitraumVon,
      zeitraumBis: parsed.zeitraumBis,
      startKontostand: parsed.startKontostand,
      endKontostand: parsed.endKontostand,
      anzahlBuchungen: selected.length,
      rohtext: meta.rohtext,
    }
    const id = await db.statements.add(statement)
    const txs: Transaction[] = selected.map((i) => ({
      hash: i.hash,
      buchungsdatum: i.buchungsdatum,
      valuta: i.valuta,
      buchungsart: i.buchungsart,
      gegenpartei: i.gegenpartei,
      text: i.text,
      betrag: i.betrag,
      kategorieId: i.kategorieId,
      quelle: 'pdf',
      statementId: id,
    }))
    await db.transactions.bulkAdd(txs)

    // Dispolimit aus dem Auszug übernehmen, falls noch nicht gesetzt
    if (parsed.dispoLimit) {
      const s = await getSettings()
      if (!s.dispoLimit) await updateSettings({ dispoLimit: parsed.dispoLimit })
    }
    return id
  })
  return { statementId, gespeichert: selected.length }
}

export async function deleteStatement(statementId: number): Promise<void> {
  await db.transaction('rw', db.statements, db.transactions, async () => {
    await db.transactions.where('statementId').equals(statementId).delete()
    await db.statements.delete(statementId)
  })
}

export async function addManualTransaction(input: {
  buchungsdatum: string
  gegenpartei: string
  text: string
  betrag: number
  kategorieId?: number
}): Promise<number> {
  const [rules, categories] = await Promise.all([db.rules.toArray(), db.categories.toArray()])
  const lookup = buildCategoryLookup(categories)
  const base = {
    buchungsdatum: input.buchungsdatum,
    valuta: input.buchungsdatum,
    buchungsart: 'Manuell',
    gegenpartei: input.gegenpartei,
    text: input.text || input.gegenpartei,
    betrag: input.betrag,
  }
  const [withHash] = assignHashes([{ ...base, text: `${base.text} ${Date.now()}` }])
  const tx: Transaction = {
    ...base,
    hash: withHash.hash,
    kategorieId: input.kategorieId ?? categorize(base, rules, lookup),
    kategorieManuell: input.kategorieId !== undefined,
    quelle: 'manuell',
  }
  return db.transactions.add(tx)
}

/**
 * Kategorie einer Buchung ändern. Optional wird eine Regel aus der Gegenpartei gelernt
 * und auf alle nicht manuell kategorisierten Buchungen angewendet.
 */
export async function setTransactionCategory(
  txId: number,
  kategorieId: number,
  opts: { learn: boolean },
): Promise<{ regelGelernt?: string; aktualisiert: number }> {
  const tx = await db.transactions.get(txId)
  if (!tx) return { aktualisiert: 0 }
  await db.transactions.update(txId, { kategorieId, kategorieManuell: true })
  if (!opts.learn) return { aktualisiert: 1 }

  const keyword = keywordFromCounterparty(tx.gegenpartei || tx.text)
  if (!keyword || keyword.length < 3) return { aktualisiert: 1 }

  // vorhandene Nutzerregel mit gleichem Schlagwort ersetzen
  const existing = await db.rules.where('schlagwort').equals(keyword).toArray()
  for (const r of existing) await db.rules.delete(r.id!)
  await db.rules.add({ schlagwort: keyword, kategorieId, prioritaet: 200 })

  const updated = await recategorizeAll()
  return { regelGelernt: keyword, aktualisiert: updated + 1 }
}

/** Alle nicht manuell kategorisierten Buchungen mit den aktuellen Regeln neu kategorisieren */
export async function recategorizeAll(): Promise<number> {
  const [rules, categories, txs] = await Promise.all([
    db.rules.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
  ])
  const lookup = buildCategoryLookup(categories)
  const updated = applyCategories(txs, rules, lookup)
  const changed = updated.filter((t, i) => t.kategorieId !== txs[i].kategorieId)
  if (changed.length) await db.transactions.bulkPut(changed)
  return changed.length
}

// ---------------------------------------------------------------------------
// Backup

export interface Backup {
  app: 'schuldenanalyse'
  version: 1
  exportiert: string
  transactions: Transaction[]
  categories: Category[]
  rules: Rule[]
  statements: Statement[]
  settings: Settings
}

export async function exportBackup(): Promise<Backup> {
  const [transactions, categories, rules, statements, settings] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.rules.toArray(),
    db.statements.toArray(),
    getSettings(),
  ])
  return {
    app: 'schuldenanalyse',
    version: 1,
    exportiert: new Date().toISOString(),
    transactions,
    categories,
    rules,
    statements,
    settings,
  }
}

export function isBackup(x: unknown): x is Backup {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as Backup).app === 'schuldenanalyse' &&
    Array.isArray((x as Backup).transactions) &&
    Array.isArray((x as Backup).categories)
  )
}

/** Backup einspielen. Ersetzt alle vorhandenen Daten. */
export async function importBackup(b: Backup): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
    await db.categories.bulkAdd(b.categories)
    await db.rules.bulkAdd(b.rules ?? [])
    await db.statements.bulkAdd(b.statements ?? [])
    await db.transactions.bulkAdd(b.transactions)
    await db.settings.put({ ...b.settings, id: 'main' })
  })
  await ensureDefaults()
}

export function backupFilename(): string {
  return `schuldenanalyse-backup-${todayIso()}.json`
}
