import Dexie, { type Table } from 'dexie'
import {
  DEFAULT_SETTINGS,
  type Category,
  type Rule,
  type Settings,
  type Statement,
  type Transaction,
} from './types'
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from '../categorize/defaultRules'

export class SchuldenDB extends Dexie {
  transactions!: Table<Transaction, number>
  categories!: Table<Category, number>
  rules!: Table<Rule, number>
  statements!: Table<Statement, number>
  settings!: Table<Settings, string>

  constructor() {
    super('schuldenanalyse')
    this.version(1).stores({
      transactions: '++id, &hash, buchungsdatum, kategorieId, statementId, quelle',
      categories: '++id, name, typ',
      rules: '++id, schlagwort, kategorieId',
      statements: '++id, importDatum',
      settings: 'id',
    })
  }
}

export const db = new SchuldenDB()

/**
 * Legt beim ersten Start Standardkategorien, -regeln und -einstellungen an.
 * Ist idempotent: bereits vorhandene Daten werden nicht überschrieben.
 */
export async function ensureDefaults(): Promise<void> {
  await db.transaction('rw', db.categories, db.rules, db.settings, async () => {
    const catCount = await db.categories.count()
    if (catCount === 0) {
      await db.categories.bulkAdd(DEFAULT_CATEGORIES)
    }
    const ruleCount = await db.rules.count()
    if (ruleCount === 0) {
      const cats = await db.categories.toArray()
      const byName = new Map(cats.map((c) => [c.name, c.id!]))
      const rules: Rule[] = []
      for (const r of DEFAULT_RULES) {
        const kategorieId = byName.get(r.kategorie)
        if (kategorieId !== undefined) {
          rules.push({ schlagwort: r.schlagwort, kategorieId, prioritaet: r.prioritaet ?? 50 })
        }
      }
      await db.rules.bulkAdd(rules)
    }
    const settings = await db.settings.get('main')
    if (!settings) {
      await db.settings.put(DEFAULT_SETTINGS)
    }
  })
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('main')) ?? DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'main' })
}

/** Alle Nutzdaten löschen und Standardwerte neu anlegen. */
export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  await ensureDefaults()
}
