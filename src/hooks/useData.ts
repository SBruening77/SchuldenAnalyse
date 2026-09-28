import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { DEFAULT_SETTINGS, type BalancePoint, type Category, type Rule, type Settings, type Statement, type Transaction } from '../db/types'
import { detectRecurring, type RecurringItem } from '../analysis/recurring'
import { computeBudget, type BudgetResult } from '../analysis/budget'
import { analyzeDebt, type DebtAnalysis } from '../analysis/debt'
import { todayIso } from '../lib/format'

export interface AppData {
  loading: boolean
  transactions: Transaction[]
  categories: Category[]
  categoryById: Map<number, Category>
  rules: Rule[]
  statements: Statement[]
  settings: Settings
  anchors: BalancePoint[]
  recurring: RecurringItem[]
  budget: BudgetResult
  debt: DebtAnalysis
}

export function useCategories() {
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[])
  const categoryById = useMemo(() => {
    const m = new Map<number, Category>()
    for (const c of categories) if (c.id !== undefined) m.set(c.id, c)
    return m
  }, [categories])
  return { categories, categoryById }
}

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('main'), [], undefined) ?? DEFAULT_SETTINGS
}

export function useAppData(): AppData {
  const transactions = useLiveQuery(() => db.transactions.orderBy('buchungsdatum').toArray(), [], undefined)
  const { categories, categoryById } = useCategories()
  const rules = useLiveQuery(() => db.rules.toArray(), [], [] as Rule[])
  const statements = useLiveQuery(() => db.statements.toArray(), [], [] as Statement[])
  const settings = useSettings()

  const txs = transactions ?? []
  const anchors = useMemo<BalancePoint[]>(() => {
    const out: BalancePoint[] = []
    for (const s of statements) {
      if (s.zeitraumVon && s.startKontostand !== undefined) out.push({ datum: s.zeitraumVon, saldo: s.startKontostand })
      if (s.zeitraumBis && s.endKontostand !== undefined) out.push({ datum: s.zeitraumBis, saldo: s.endKontostand })
    }
    // pro Datum nur ein Anker (Endsaldo Auszug N = Anfangssaldo Auszug N+1)
    const byDate = new Map(out.map((a) => [a.datum, a]))
    return [...byDate.values()].sort((a, b) => a.datum.localeCompare(b.datum))
  }, [statements])

  const today = todayIso()
  const recurring = useMemo(() => detectRecurring(txs, { referenceDate: today }), [txs, today])
  const budget = useMemo(() => computeBudget(txs, anchors, recurring, settings, today), [txs, anchors, recurring, settings, today])
  const debt = useMemo(() => analyzeDebt(txs, categories, anchors, recurring, today), [txs, categories, anchors, recurring, today])

  return {
    loading: transactions === undefined,
    transactions: txs,
    categories,
    categoryById,
    rules,
    statements,
    settings,
    anchors,
    recurring,
    budget,
    debt,
  }
}
