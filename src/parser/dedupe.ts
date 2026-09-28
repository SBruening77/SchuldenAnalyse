/**
 * Duplikat-Erkennung: stabiler Hash aus Buchungsdatum, Betrag und normalisiertem Text.
 * Gleiche Buchung in zwei überlappenden Auszügen erzeugt denselben Hash.
 */

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9äöüß ]/g, '')
    .trim()
}

/** FNV-1a 32 Bit, zweifach mit unterschiedlichem Seed → 16 Hex-Zeichen */
export function fnv1a(str: string, seed = 0x811c9dc5): string {
  let h = seed >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function transactionHash(t: { buchungsdatum: string; betrag: number; text: string; buchungsart?: string }): string {
  const key = `${t.buchungsdatum}|${t.betrag.toFixed(2)}|${normalizeText(`${t.buchungsart ?? ''} ${t.text}`)}`
  return fnv1a(key) + fnv1a(key, 0x9747b28c)
}

/**
 * Bei mehreren identischen Buchungen am selben Tag (z. B. zwei gleiche Kartenzahlungen)
 * wird ein Zähler angehängt, damit beide gespeichert werden können.
 */
export function assignHashes<T extends { buchungsdatum: string; betrag: number; text: string; buchungsart?: string }>(
  items: T[],
): Array<T & { hash: string }> {
  const seen = new Map<string, number>()
  return items.map((t) => {
    const base = transactionHash(t)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return { ...t, hash: n === 0 ? base : `${base}-${n}` }
  })
}
