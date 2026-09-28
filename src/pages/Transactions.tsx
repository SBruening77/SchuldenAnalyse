import { useMemo, useState } from 'react'
import { db } from '../db/schema'
import { addManualTransaction, setTransactionCategory } from '../db/ops'
import type { Transaction } from '../db/types'
import { formatDate, formatMonth, monthKeyOf, todayIso } from '../lib/format'
import { useAppData } from '../hooks/useData'
import { CategorySelect } from '../components/CategorySelect'
import { CategoryBadge, EmptyState, Money, PageHeader, Sheet } from '../components/ui'

export function Transactions() {
  const { transactions, categories, categoryById, loading } = useAppData()
  const months = useMemo(() => [...new Set(transactions.map((t) => monthKeyOf(t.buchungsdatum)))].sort().reverse(), [transactions])
  const [month, setMonth] = useState<string>('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [adding, setAdding] = useState(false)

  const activeMonth = month || months[0] || ''
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions
      .filter((t) => (q ? `${t.gegenpartei} ${t.text} ${t.buchungsart}`.toLowerCase().includes(q) : monthKeyOf(t.buchungsdatum) === activeMonth))
      .sort((a, b) => b.buchungsdatum.localeCompare(a.buchungsdatum) || (b.id ?? 0) - (a.id ?? 0))
  }, [transactions, activeMonth, query])

  const sumIn = list.filter((t) => t.betrag > 0).reduce((s, t) => s + t.betrag, 0)
  const sumOut = list.filter((t) => t.betrag < 0).reduce((s, t) => s + t.betrag, 0)

  return (
    <div>
      <PageHeader
        title="Buchungen"
        subtitle={`${transactions.length} gesamt`}
        right={
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setAdding(true)}>
            + Manuell
          </button>
        }
      />
      <div className="mx-auto max-w-lg px-4 pt-3">
        <input className="input mb-3" placeholder="Suchen (alle Monate) …" value={query} onChange={(e) => setQuery(e.target.value)} />
        {!query && months.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {months.map((m) => (
              <button
                key={m}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${m === activeMonth ? 'bg-emerald-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300'}`}
                onClick={() => setMonth(m)}
              >
                {formatMonth(m)}
              </button>
            ))}
          </div>
        )}

        {!loading && transactions.length === 0 ? (
          <EmptyState title="Noch keine Buchungen" text="Importiere einen Kontoauszug oder lege eine Buchung manuell an." />
        ) : (
          <>
            <div className="mb-3 flex justify-between px-1 text-xs text-slate-400">
              <span>
                Einnahmen <Money value={sumIn} />
              </span>
              <span>
                Ausgaben <Money value={sumOut} />
              </span>
              <span>
                Saldo <Money value={sumIn + sumOut} />
              </span>
            </div>
            <ul className="card divide-y divide-slate-800 p-0">
              {list.map((t) => (
                <li key={t.id}>
                  <button className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-slate-800/60" onClick={() => setEditing(t)}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.gegenpartei || t.buchungsart || t.text}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDate(t.buchungsdatum)}
                        {t.buchungsart && t.buchungsart !== t.gegenpartei ? ` · ${t.buchungsart}` : ''}
                        {t.quelle === 'manuell' ? ' · manuell' : ''}
                      </p>
                      <div className="mt-1.5">
                        <CategoryBadge small category={t.kategorieId !== undefined ? categoryById.get(t.kategorieId) : undefined} />
                      </div>
                    </div>
                    <Money value={t.betrag} className="shrink-0 font-semibold" />
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Keine Treffer.</li>}
            </ul>
          </>
        )}
      </div>

      <EditSheet tx={editing} onClose={() => setEditing(null)} categories={categories} />
      <AddSheet open={adding} onClose={() => setAdding(false)} categories={categories} />
    </div>
  )
}

function EditSheet({ tx, onClose, categories }: { tx: Transaction | null; onClose: () => void; categories: ReturnType<typeof useAppData>['categories'] }) {
  const [learn, setLearn] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function changeCategory(id: number | undefined) {
    if (!tx || id === undefined) return
    setBusy(true)
    const res = await setTransactionCategory(tx.id!, id, { learn })
    setBusy(false)
    setMessage(res.regelGelernt ? `Regel „${res.regelGelernt}“ gelernt, ${res.aktualisiert} Buchung(en) aktualisiert.` : 'Kategorie gespeichert.')
  }

  async function remove() {
    if (!tx) return
    if (!confirm('Buchung löschen?')) return
    await db.transactions.delete(tx.id!)
    onClose()
  }

  return (
    <Sheet
      open={!!tx}
      onClose={() => {
        setMessage(null)
        onClose()
      }}
      title="Buchung"
    >
      {tx && (
        <div className="space-y-4">
          <div>
            <p className="text-lg font-semibold">{tx.gegenpartei || tx.buchungsart}</p>
            <p className="text-sm text-slate-400">
              {formatDate(tx.buchungsdatum)} · {tx.buchungsart}
            </p>
            <p className="mt-1 text-2xl">
              <Money value={tx.betrag} />
            </p>
            {tx.text && <p className="mt-2 break-words text-xs text-slate-400">{tx.text}</p>}
          </div>
          <div>
            <label className="label">Kategorie</label>
            <CategorySelect categories={categories} value={tx.kategorieId} onChange={(id) => void changeCategory(id)} />
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
              Regel für „{tx.gegenpartei || tx.text}“ merken und ähnliche Buchungen anpassen
            </label>
            {busy && <p className="mt-2 text-xs text-slate-400">Speichern …</p>}
            {message && <p className="mt-2 text-xs text-emerald-400">{message}</p>}
          </div>
          <button className="btn-danger w-full" onClick={() => void remove()}>
            Buchung löschen
          </button>
        </div>
      )}
    </Sheet>
  )
}

function AddSheet({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: ReturnType<typeof useAppData>['categories'] }) {
  const [datum, setDatum] = useState(todayIso())
  const [gegenpartei, setGegenpartei] = useState('')
  const [text, setText] = useState('')
  const [betrag, setBetrag] = useState('')
  const [ausgabe, setAusgabe] = useState(true)
  const [kategorieId, setKategorieId] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const value = Number(betrag.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Bitte einen gültigen Betrag eingeben.')
      return
    }
    if (!gegenpartei.trim()) {
      setError('Bitte eine Bezeichnung eingeben.')
      return
    }
    await addManualTransaction({
      buchungsdatum: datum,
      gegenpartei: gegenpartei.trim(),
      text: text.trim(),
      betrag: ausgabe ? -value : value,
      kategorieId,
    })
    setGegenpartei('')
    setText('')
    setBetrag('')
    setError(null)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Buchung manuell erfassen">
      <div className="space-y-3">
        <p className="text-xs text-slate-400">
          Für Ausgaben, die noch nicht auf einem Auszug stehen – damit „frei verfügbar“ im laufenden Monat stimmt.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className={`btn ${ausgabe ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}`} onClick={() => setAusgabe(true)}>
            Ausgabe
          </button>
          <button className={`btn ${!ausgabe ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`} onClick={() => setAusgabe(false)}>
            Einnahme
          </button>
        </div>
        <div>
          <label className="label">Betrag in €</label>
          <input className="input text-xl" inputMode="decimal" placeholder="0,00" value={betrag} onChange={(e) => setBetrag(e.target.value)} />
        </div>
        <div>
          <label className="label">Bezeichnung</label>
          <input className="input" placeholder="z. B. REWE, Tanken, Friseur" value={gegenpartei} onChange={(e) => setGegenpartei(e.target.value)} />
        </div>
        <div>
          <label className="label">Datum</label>
          <input className="input" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <div>
          <label className="label">Notiz (optional)</label>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <label className="label">Kategorie</label>
          <CategorySelect categories={categories} value={kategorieId} onChange={setKategorieId} allowEmpty />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button className="btn-primary w-full" onClick={() => void save()}>
          Speichern
        </button>
      </div>
    </Sheet>
  )
}
