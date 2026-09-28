import type { Category, Rule, Transaction } from '../db/types'

export interface CategorizeInput {
  buchungsart: string
  gegenpartei: string
  text: string
  betrag: number
}

export interface CategoryLookup {
  byId: Map<number, Category>
  sonstigeEinnahmenId?: number
  sonstigesId?: number
}

export function buildCategoryLookup(categories: Category[]): CategoryLookup {
  const byId = new Map<number, Category>()
  for (const c of categories) if (c.id !== undefined) byId.set(c.id, c)
  return {
    byId,
    sonstigeEinnahmenId: categories.find((c) => c.name === 'Sonstige Einnahmen')?.id,
    sonstigesId: categories.find((c) => c.name === 'Sonstiges')?.id,
  }
}

export function normalizeForMatch(s: string): string {
  return ` ${s.toLowerCase().replace(/\s+/g, ' ').trim()} `
}

/**
 * Ermittelt die Kategorie einer Buchung anhand der Schlagwort-Regeln.
 * Höchste Priorität gewinnt, bei Gleichstand das längere Schlagwort.
 * Vorzeichen-Plausibilität: Einnahmen-Kategorien nur für positive Beträge usw.
 */
export function categorize(tx: CategorizeInput, rules: Rule[], lookup: CategoryLookup): number | undefined {
  const haystack = normalizeForMatch(`${tx.buchungsart} ${tx.gegenpartei} ${tx.text}`)
  let best: Rule | undefined
  for (const r of rules) {
    const kw = r.schlagwort.toLowerCase()
    if (!kw) continue
    if (!haystack.includes(kw)) continue
    if (!best || r.prioritaet > best.prioritaet || (r.prioritaet === best.prioritaet && kw.length > best.schlagwort.length)) {
      best = r
    }
  }
  const cat = best ? lookup.byId.get(best.kategorieId) : undefined
  if (!cat) {
    return tx.betrag > 0 ? lookup.sonstigeEinnahmenId : lookup.sonstigesId
  }
  if (tx.betrag > 0 && (cat.typ === 'fix' || cat.typ === 'variabel' || cat.typ === 'schulden')) {
    // Rückerstattung / Gutschrift eines Händlers → Einnahme
    return lookup.sonstigeEinnahmenId ?? cat.id
  }
  if (tx.betrag < 0 && cat.typ === 'einkommen') {
    return lookup.sonstigesId ?? cat.id
  }
  return cat.id
}

/** Schlagwort aus einer Gegenpartei ableiten (für "Regel lernen") */
export function keywordFromCounterparty(gegenpartei: string): string {
  const cleaned = gegenpartei
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9äöüß&.\- ]/g, '')
    .trim()
  // erste bis zu drei Wörter, sofern aussagekräftig
  const words = cleaned.split(' ').filter((w) => w.length > 1)
  return words.slice(0, 3).join(' ').trim() || cleaned
}

export function applyCategories(
  txs: Transaction[],
  rules: Rule[],
  lookup: CategoryLookup,
  opts: { overrideManual?: boolean } = {},
): Transaction[] {
  return txs.map((t) => {
    if (t.kategorieManuell && !opts.overrideManual) return t
    return { ...t, kategorieId: categorize(t, rules, lookup) }
  })
}
