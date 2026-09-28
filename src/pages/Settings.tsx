import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, resetAll, updateSettings } from '../db/schema'
import { backupFilename, exportBackup, importBackup, isBackup, recategorizeAll } from '../db/ops'
import type { Category, CategoryType, Rule } from '../db/types'
import { useAppData } from '../hooks/useData'
import { formatDate, formatEur, todayIso } from '../lib/format'
import { CategorySelect } from '../components/CategorySelect'
import { Callout, PageHeader, Section, Sheet } from '../components/ui'
import { CATEGORY_TYPE_LABELS } from '../categorize/defaultRules'

export function Settings() {
  const { settings, categories, budget, statements } = useAppData()
  const [msg, setMsg] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [catsOpen, setCatsOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // lokale Formularwerte
  const [kontostand, setKontostand] = useState('')
  const [kontostandDatum, setKontostandDatum] = useState(todayIso())
  const [dispo, setDispo] = useState('')
  const [puffer, setPuffer] = useState('')
  const [monatsStart, setMonatsStart] = useState('1')

  useEffect(() => {
    setDispo(settings.dispoLimit ? String(settings.dispoLimit).replace('.', ',') : '')
    setPuffer(settings.sicherheitsPuffer ? String(settings.sicherheitsPuffer).replace('.', ',') : '')
    setMonatsStart(String(settings.monatsStart || 1))
  }, [settings])

  const num = (s: string) => {
    const v = Number(s.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(v) ? v : NaN
  }

  async function saveKontostand() {
    const v = num(kontostand)
    if (Number.isNaN(v)) return setMsg('Bitte einen gültigen Kontostand eingeben (negativ für Dispo).')
    await updateSettings({ kontostandManuell: v, kontostandManuellDatum: kontostandDatum })
    setKontostand('')
    setMsg(`Kontostand ${formatEur(v)} zum ${formatDate(kontostandDatum)} gespeichert.`)
  }

  async function clearKontostand() {
    await updateSettings({ kontostandManuell: undefined, kontostandManuellDatum: undefined })
    setMsg('Manueller Kontostand entfernt – es gilt wieder der Auszug.')
  }

  async function saveLimits() {
    const d = dispo.trim() ? num(dispo) : 0
    const p = puffer.trim() ? num(puffer) : 0
    const ms = Math.min(28, Math.max(1, Number(monatsStart) || 1))
    if (Number.isNaN(d) || Number.isNaN(p)) return setMsg('Bitte gültige Zahlen eingeben.')
    await updateSettings({ dispoLimit: d, sicherheitsPuffer: p, monatsStart: ms })
    setMsg('Einstellungen gespeichert.')
  }

  async function doExport() {
    const b = await exportBackup()
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFilename()
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setMsg(`Backup mit ${b.transactions.length} Buchungen exportiert.`)
  }

  async function doImport(file: File) {
    try {
      const json = JSON.parse(await file.text()) as unknown
      if (!isBackup(json)) return setMsg('Die Datei ist kein SchuldenAnalyse-Backup.')
      if (!confirm(`Backup vom ${formatDate(json.exportiert.slice(0, 10))} mit ${json.transactions.length} Buchungen einspielen? Alle aktuellen Daten werden ersetzt.`)) return
      await importBackup(json)
      setMsg('Backup eingespielt.')
    } catch (e) {
      setMsg(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function doReset() {
    if (!confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden. Vorher ein Backup exportieren!')) return
    if (!confirm('Letzte Bestätigung: alle Buchungen, Auszüge und Regeln löschen?')) return
    await resetAll()
    setMsg('Alle Daten gelöscht.')
  }

  return (
    <div>
      <PageHeader title="Einstellungen" subtitle="Daten bleiben ausschließlich auf diesem Gerät" />
      <div className="mx-auto max-w-lg px-4 pt-4">
        {msg && (
          <div className="mb-3">
            <Callout kind="info">{msg}</Callout>
          </div>
        )}

        <Section title="Aktueller Kontostand">
          <div className="card space-y-3">
            <p className="text-xs text-slate-400">
              PDF-Auszüge kommen meist erst am Monatsende. Trage hier den aktuellen Stand aus dem Online-Banking ein, damit „frei verfügbar“
              stimmt. Aktuell verwendet:{' '}
              <span className="text-slate-200">
                {budget.kontostand !== undefined ? `${formatEur(budget.kontostand)} (${budget.kontostandQuelle === 'manuell' ? 'manuell' : 'Auszug'}, Stand ${formatDate(budget.kontostandDatum!)})` : 'unbekannt'}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Kontostand €</label>
                <input className="input" inputMode="decimal" placeholder="z. B. -250,00" value={kontostand} onChange={(e) => setKontostand(e.target.value)} />
              </div>
              <div>
                <label className="label">Stand vom</label>
                <input className="input" type="date" value={kontostandDatum} onChange={(e) => setKontostandDatum(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => void saveKontostand()}>
                Speichern
              </button>
              {settings.kontostandManuell !== undefined && (
                <button className="btn-secondary" onClick={() => void clearKontostand()}>
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>
        </Section>

        <Section title="Budget">
          <div className="card space-y-3">
            <div>
              <label className="label">Dispolimit €</label>
              <input className="input" inputMode="decimal" placeholder="0" value={dispo} onChange={(e) => setDispo(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Wird im Saldoverlauf angezeigt und für Warnungen genutzt.</p>
            </div>
            <div>
              <label className="label">Sicherheitspuffer €</label>
              <input className="input" inputMode="decimal" placeholder="0" value={puffer} onChange={(e) => setPuffer(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Wird von „frei verfügbar“ abgezogen, z. B. für unerwartete Ausgaben.</p>
            </div>
            <div>
              <label className="label">Budgetmonat beginnt am Tag</label>
              <input className="input" inputMode="numeric" value={monatsStart} onChange={(e) => setMonatsStart(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">1 = Kalendermonat. Bei Gehalt am 25. z. B. „25“ eintragen.</p>
            </div>
            <button className="btn-primary w-full" onClick={() => void saveLimits()}>
              Speichern
            </button>
          </div>
        </Section>

        <Section title="Kategorien und Regeln">
          <div className="card space-y-2">
            <button className="btn-secondary w-full" onClick={() => setCatsOpen(true)}>
              Kategorien verwalten ({categories.length})
            </button>
            <button className="btn-secondary w-full" onClick={() => setRulesOpen(true)}>
              Regeln verwalten
            </button>
            <button
              className="btn-secondary w-full"
              onClick={async () => {
                const n = await recategorizeAll()
                setMsg(`${n} Buchung(en) neu kategorisiert.`)
              }}
            >
              Alle Buchungen neu kategorisieren
            </button>
          </div>
        </Section>

        <Section title="Backup">
          <div className="card space-y-2">
            <p className="text-xs text-slate-400">
              Da es keinen Server gibt, bist du selbst für Sicherungen verantwortlich. Exportiere regelmäßig ein Backup (JSON) in die Dateien-App
              oder iCloud Drive.
            </p>
            <button className="btn-primary w-full" onClick={() => void doExport()}>
              Backup exportieren
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void doImport(f)
              }}
            />
            <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()}>
              Backup einspielen
            </button>
            <p className="text-xs text-slate-500">
              {statements.length} Auszüge importiert.
            </p>
          </div>
        </Section>

        <Section title="Gefahrenzone">
          <div className="card">
            <button className="btn-danger w-full" onClick={() => void doReset()}>
              Alle Daten löschen
            </button>
          </div>
        </Section>

        <p className="mb-4 text-center text-xs text-slate-600">
          SchuldenAnalyse · lokal, offline, ohne Server · v{__APP_VERSION__}
        </p>
      </div>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} categories={categories} />
      <CategoriesSheet open={catsOpen} onClose={() => setCatsOpen(false)} />
    </div>
  )
}

function RulesSheet({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: Category[] }) {
  const rules = useLiveQuery(() => db.rules.orderBy('schlagwort').toArray(), [], [] as Rule[])
  const [filter, setFilter] = useState('')
  const [newKw, setNewKw] = useState('')
  const [newCat, setNewCat] = useState<number | undefined>(undefined)
  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? '?'
  const list = rules.filter((r) => !filter || r.schlagwort.includes(filter.toLowerCase()) || catName(r.kategorieId).toLowerCase().includes(filter.toLowerCase()))
  const userRules = rules.filter((r) => r.prioritaet >= 200)

  async function addRule() {
    const kw = newKw.trim().toLowerCase()
    if (!kw || newCat === undefined) return
    await db.rules.add({ schlagwort: kw, kategorieId: newCat, prioritaet: 200 })
    setNewKw('')
    await recategorizeAll()
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Regeln (${rules.length}, davon ${userRules.length} eigene)`}>
      <div className="space-y-3">
        <div className="card space-y-2 p-3">
          <p className="text-xs text-slate-400">Neue Regel: Schlagwort im Buchungstext → Kategorie. Eigene Regeln haben Vorrang.</p>
          <input className="input" placeholder="Schlagwort, z. B. „lieferando“" value={newKw} onChange={(e) => setNewKw(e.target.value)} />
          <CategorySelect categories={categories} value={newCat} onChange={setNewCat} allowEmpty />
          <button className="btn-primary w-full" disabled={!newKw.trim() || newCat === undefined} onClick={() => void addRule()}>
            Regel anlegen
          </button>
        </div>
        <input className="input" placeholder="Filtern …" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="divide-y divide-slate-800 text-sm">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{r.schlagwort}</p>
                <p className="text-xs text-slate-500">
                  → {catName(r.kategorieId)} {r.prioritaet >= 200 ? '· eigene' : `· Prio ${r.prioritaet}`}
                </p>
              </div>
              <button
                className="text-xs text-rose-300 underline"
                onClick={async () => {
                  await db.rules.delete(r.id!)
                  await recategorizeAll()
                }}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}

function CategoriesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[])
  const [name, setName] = useState('')
  const [typ, setTyp] = useState<CategoryType>('variabel')
  const types: CategoryType[] = ['einkommen', 'fix', 'variabel', 'schulden', 'sonstiges']

  async function add() {
    if (!name.trim()) return
    await db.categories.add({ name: name.trim(), typ, farbe: randomColor() })
    setName('')
  }

  async function remove(c: Category) {
    const count = await db.transactions.where('kategorieId').equals(c.id!).count()
    if (!confirm(`Kategorie „${c.name}“ löschen? ${count} Buchung(en) werden neu zugeordnet.`)) return
    const sonst = categories.find((x) => x.name === 'Sonstiges')
    await db.transaction('rw', db.categories, db.rules, db.transactions, async () => {
      await db.rules.where('kategorieId').equals(c.id!).delete()
      if (sonst) await db.transactions.where('kategorieId').equals(c.id!).modify({ kategorieId: sonst.id, kategorieManuell: false })
      await db.categories.delete(c.id!)
    })
    await recategorizeAll()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Kategorien">
      <div className="space-y-3">
        <div className="card space-y-2 p-3">
          <input className="input" placeholder="Neue Kategorie" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={typ} onChange={(e) => setTyp(e.target.value as CategoryType)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {CATEGORY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button className="btn-primary w-full" disabled={!name.trim()} onClick={() => void add()}>
            Anlegen
          </button>
        </div>
        {types.map((t) => (
          <div key={t}>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{CATEGORY_TYPE_LABELS[t]}</p>
            <ul className="divide-y divide-slate-800 text-sm">
              {categories
                .filter((c) => c.typ === t)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.farbe }} />
                      {c.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <select
                        className="rounded-lg bg-slate-800 px-2 py-1 text-xs"
                        value={c.typ}
                        onChange={(e) => void db.categories.update(c.id!, { typ: e.target.value as CategoryType })}
                      >
                        {types.map((tt) => (
                          <option key={tt} value={tt}>
                            {CATEGORY_TYPE_LABELS[tt]}
                          </option>
                        ))}
                      </select>
                      {!c.system && (
                        <button className="text-xs text-rose-300 underline" onClick={() => void remove(c)}>
                          Löschen
                        </button>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function randomColor(): string {
  const palette = ['#f472b6', '#22d3ee', '#a3e635', '#fb7185', '#facc15', '#c084fc', '#34d399', '#fb923c']
  return palette[Math.floor(Math.random() * palette.length)]
}
