import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { commitImport, deleteStatement, prepareImport, type ImportPreviewItem } from '../db/ops'
import type { Statement } from '../db/types'
import { parseSparkasse, parseSparkasseText } from '../parser/sparkasse'
import type { ParsedStatement } from '../parser/types'
import { formatDate, formatDateShort, formatEur } from '../lib/format'
import { useCategories } from '../hooks/useData'
import { CategorySelect } from '../components/CategorySelect'
import { Callout, Money, PageHeader, Section, Spinner } from '../components/ui'

interface PreviewFile {
  id: string
  dateiname: string
  rohtext: string
  parsed: ParsedStatement
  items: ImportPreviewItem[]
  /** Fehler beim Lesen/Parsen dieser Datei */
  fehler?: string
  /** bestehender Import, der ersetzt wird ("Neu auswerten") */
  replaceStatementId?: number
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'preview'; files: PreviewFile[] }
  | { kind: 'done'; gespeichert: number; dateien: number }
  | { kind: 'error'; message: string }

export function Import() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { categories } = useCategories()
  const statements = useLiveQuery(() => db.statements.orderBy('importDatum').reverse().toArray(), [], [] as Statement[])

  /** Duplikate innerhalb eines Stapels markieren (gleiche Buchung in zwei überlappenden Auszügen) */
  function markBatchDuplicates(files: PreviewFile[]): PreviewFile[] {
    const seen = new Set<string>()
    return files.map((f) => ({
      ...f,
      items: f.items.map((i) => {
        if (i.duplikat) return i
        if (seen.has(i.hash)) return { ...i, duplikat: true, ausgewaehlt: false }
        seen.add(i.hash)
        return i
      }),
    }))
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    const results: PreviewFile[] = []
    try {
      const { extractPdfText } = await import('../parser/pdfText')
      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx]
        const prefix = files.length > 1 ? `Datei ${idx + 1} von ${files.length}: ` : ''
        setStage({ kind: 'working', label: `${prefix}${file.name} wird gelesen …` })
        try {
          const buf = await file.arrayBuffer()
          const extracted = await extractPdfText(buf, (p, total) =>
            setStage({ kind: 'working', label: `${prefix}${file.name} – Seite ${p} von ${total} …` }),
          )
          const rohtext = extracted.lines.map((l) => l.text).join('\n')
          const parsed = parseSparkasse(extracted.lines)
          const items = await prepareImport(parsed)
          results.push({ id: `${Date.now()}-${idx}`, dateiname: file.name, rohtext, parsed, items })
        } catch (e) {
          results.push({
            id: `${Date.now()}-${idx}`,
            dateiname: file.name,
            rohtext: '',
            parsed: { transactions: [], balances: [], warnings: [], layout: 'unbekannt' },
            items: [],
            fehler: e instanceof Error ? e.message : String(e),
          })
        }
      }
      // Auszüge chronologisch sortieren (nach Zeitraum), damit die Vorschau übersichtlich ist
      results.sort((a, b) => (a.parsed.zeitraumVon ?? '').localeCompare(b.parsed.zeitraumVon ?? ''))
      setStage({ kind: 'preview', files: markBatchDuplicates(results) })
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function handlePaste() {
    try {
      setStage({ kind: 'working', label: 'Text wird analysiert …' })
      const parsed = parseSparkasseText(pasteText)
      const items = await prepareImport(parsed)
      setPasteOpen(false)
      setStage({ kind: 'preview', files: [{ id: `${Date.now()}`, dateiname: 'Eingefügter Text', rohtext: pasteText, parsed, items }] })
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Bereits importierten Auszug mit dem aktuellen Parser erneut auswerten */
  async function handleReparse(s: Statement) {
    try {
      setStage({ kind: 'working', label: `${s.dateiname} wird neu ausgewertet …` })
      const parsed = parseSparkasseText(s.rohtext)
      const items = await prepareImport(parsed, { replaceStatementId: s.id })
      setStage({
        kind: 'preview',
        files: [{ id: `${Date.now()}`, dateiname: s.dateiname, rohtext: s.rohtext, parsed, items, replaceStatementId: s.id }],
      })
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function handleCommit() {
    if (stage.kind !== 'preview') return
    const files = stage.files.filter((f) => !f.fehler)
    setStage({ kind: 'working', label: 'Buchungen werden gespeichert …' })
    try {
      let gespeichert = 0
      let dateien = 0
      for (const f of files) {
        const hasSelected = f.items.some((i) => i.ausgewaehlt && !i.duplikat)
        if (!hasSelected && f.replaceStatementId === undefined) continue
        const res = await commitImport(f.parsed, f.items, {
          dateiname: f.dateiname,
          rohtext: f.rohtext,
          replaceStatementId: f.replaceStatementId,
        })
        gespeichert += res.gespeichert
        dateien++
      }
      setStage({ kind: 'done', gespeichert, dateien })
      setPasteText('')
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  function updateItem(fileId: string, hash: string, patch: Partial<ImportPreviewItem>) {
    if (stage.kind !== 'preview') return
    setStage({
      ...stage,
      files: stage.files.map((f) =>
        f.id === fileId ? { ...f, items: f.items.map((i) => (i.hash === hash ? { ...i, ...patch } : i)) } : f,
      ),
    })
  }

  function selectAll(fileId: string | null, sel: boolean) {
    if (stage.kind !== 'preview') return
    setStage({
      ...stage,
      files: stage.files.map((f) =>
        fileId === null || f.id === fileId ? { ...f, items: f.items.map((i) => (i.duplikat ? i : { ...i, ausgewaehlt: sel })) } : f,
      ),
    })
  }

  function removeFile(fileId: string) {
    if (stage.kind !== 'preview') return
    const files = stage.files.filter((f) => f.id !== fileId)
    if (files.length === 0) reset()
    else setStage({ ...stage, files })
  }

  const reset = () => {
    setStage({ kind: 'idle' })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <PageHeader title="Import" subtitle="Sparkasse-Kontoauszüge als PDF" />
      <div className="mx-auto max-w-lg px-4 pt-4">
        {stage.kind === 'idle' && (
          <>
            <div className="card">
              <p className="text-sm text-slate-300">
                Wähle eine oder mehrere PDF-Dateien aus der Dateien-App. Die Auswertung passiert vollständig auf diesem Gerät – nichts wird
                hochgeladen. Überlappende Auszüge werden automatisch bereinigt.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files)
                }}
              />
              <button className="btn-primary mt-4 w-full" onClick={() => fileRef.current?.click()}>
                PDFs auswählen
              </button>
              <button className="btn-secondary mt-2 w-full" onClick={() => setPasteOpen((v) => !v)}>
                Text aus Zwischenablage einfügen
              </button>
              {pasteOpen && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-slate-400">
                    Falls ein PDF nicht gelesen werden kann: Text im PDF markieren, kopieren und hier einfügen.
                  </p>
                  <textarea
                    className="input h-40 font-mono text-xs"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={'Kontoauszug 3/2024\n01.03. Lastschrift 45,99 S\nVodafone GmbH\n…'}
                  />
                  <button className="btn-primary mt-2 w-full" disabled={!pasteText.trim()} onClick={() => void handlePaste()}>
                    Analysieren
                  </button>
                </div>
              )}
            </div>

            <Section title={`Bisherige Importe (${statements.length})`}>
              {statements.length === 0 ? (
                <p className="px-1 text-sm text-slate-500">Noch keine Auszüge importiert.</p>
              ) : (
                <ul className="card divide-y divide-slate-800 p-0">
                  {statements.map((s) => (
                    <li key={s.id} className="px-4 py-3">
                      <p className="truncate text-sm font-medium">{s.dateiname}</p>
                      <p className="text-xs text-slate-400">
                        {s.zeitraumVon && s.zeitraumBis ? `${formatDateShort(s.zeitraumVon)} – ${formatDate(s.zeitraumBis)} · ` : ''}
                        {s.anzahlBuchungen} Buchungen
                        {s.endKontostand !== undefined ? ` · Endsaldo ${formatEur(s.endKontostand)}` : ''}
                      </p>
                      <div className="mt-2 flex gap-2">
                        {s.rohtext && (
                          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void handleReparse(s)}>
                            Neu auswerten
                          </button>
                        )}
                        <button
                          className="btn-secondary px-3 py-1.5 text-xs text-rose-300"
                          onClick={() => {
                            if (confirm(`Import „${s.dateiname}“ mit ${s.anzahlBuchungen} Buchungen löschen?`)) void deleteStatement(s.id!)
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}

        {stage.kind === 'working' && (
          <div className="card">
            <Spinner label={stage.label} />
          </div>
        )}

        {stage.kind === 'error' && (
          <div className="space-y-3">
            <Callout kind="hoch">
              <p className="font-semibold">Fehler beim Import</p>
              <p className="mt-1 break-words">{stage.message}</p>
            </Callout>
            <button className="btn-secondary w-full" onClick={reset}>
              Zurück
            </button>
          </div>
        )}

        {stage.kind === 'done' && (
          <div className="space-y-3">
            <Callout kind="ok">
              <p className="font-semibold">{stage.gespeichert} Buchungen gespeichert</p>
              <p className="mt-1">
                aus {stage.dateien} {stage.dateien === 1 ? 'Datei' : 'Dateien'}
              </p>
            </Callout>
            <Link to="/" className="btn-primary w-full">
              Zum Dashboard
            </Link>
            <button className="btn-secondary w-full" onClick={reset}>
              Weitere Auszüge importieren
            </button>
          </div>
        )}

        {stage.kind === 'preview' && (
          <PreviewView
            files={stage.files}
            categories={categories}
            onUpdate={updateItem}
            onSelectAll={selectAll}
            onRemoveFile={removeFile}
            onCommit={() => void handleCommit()}
            onCancel={reset}
          />
        )}
      </div>
    </div>
  )
}

function PreviewView({
  files,
  categories,
  onUpdate,
  onSelectAll,
  onRemoveFile,
  onCommit,
  onCancel,
}: {
  files: PreviewFile[]
  categories: ReturnType<typeof useCategories>['categories']
  onUpdate: (fileId: string, hash: string, patch: Partial<ImportPreviewItem>) => void
  onSelectAll: (fileId: string | null, sel: boolean) => void
  onRemoveFile: (fileId: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const allItems = files.flatMap((f) => f.items)
  const selected = allItems.filter((i) => i.ausgewaehlt && !i.duplikat)
  const duplicates = allItems.filter((i) => i.duplikat).length
  const failed = files.filter((f) => f.fehler).length
  const sum = selected.reduce((s, i) => s + i.betrag, 0)
  const isReplace = files.some((f) => f.replaceStatementId !== undefined)

  return (
    <div className="space-y-4">
      {files.length > 1 && (
        <div className="card space-y-2">
          <p className="text-sm font-semibold">
            {files.length} Dateien · {selected.length} Buchungen ausgewählt · Summe <Money value={sum} />
          </p>
          {duplicates > 0 && <p className="text-xs text-slate-400">{duplicates} Duplikate werden übersprungen.</p>}
          {failed > 0 && <Callout kind="hoch">{failed} Datei(en) konnten nicht gelesen werden – siehe unten.</Callout>}
          <div className="flex gap-3 text-xs text-slate-400">
            <button className="underline" onClick={() => onSelectAll(null, true)}>
              alle auswählen
            </button>
            <button className="underline" onClick={() => onSelectAll(null, false)}>
              keine
            </button>
          </div>
        </div>
      )}

      {files.map((f) => (
        <FilePreview key={f.id} file={f} categories={categories} collapsedByDefault={files.length > 1} onUpdate={onUpdate} onSelectAll={onSelectAll} onRemove={onRemoveFile} />
      ))}

      <div className="sticky bottom-24 space-y-2 rounded-2xl bg-slate-950/95 p-2 backdrop-blur">
        <button className="btn-primary w-full" disabled={selected.length === 0 && !isReplace} onClick={onCommit}>
          {isReplace ? `Import ersetzen (${selected.length} Buchungen)` : `${selected.length} Buchungen speichern`}
        </button>
        <button className="btn-secondary w-full" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

function FilePreview({
  file,
  categories,
  collapsedByDefault,
  onUpdate,
  onSelectAll,
  onRemove,
}: {
  file: PreviewFile
  categories: ReturnType<typeof useCategories>['categories']
  collapsedByDefault: boolean
  onUpdate: (fileId: string, hash: string, patch: Partial<ImportPreviewItem>) => void
  onSelectAll: (fileId: string, sel: boolean) => void
  onRemove: (fileId: string) => void
}) {
  const [open, setOpen] = useState(!collapsedByDefault)
  const [showRaw, setShowRaw] = useState(false)
  const { parsed, items } = file
  const selected = items.filter((i) => i.ausgewaehlt && !i.duplikat)
  const duplicates = items.filter((i) => i.duplikat).length
  const sum = selected.reduce((s, i) => s + i.betrag, 0)

  return (
    <div className="space-y-2">
      <div className={`card space-y-2 ${file.fehler ? 'border-rose-500/50' : ''}`}>
        <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen((v) => !v)}>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{file.dateiname}</p>
            <p className="text-xs text-slate-400">
              {parsed.zeitraumVon && parsed.zeitraumBis ? `${formatDateShort(parsed.zeitraumVon)} – ${formatDate(parsed.zeitraumBis)} · ` : ''}
              {selected.length} von {items.length} Buchungen
              {duplicates > 0 ? ` · ${duplicates} Duplikate` : ''}
              {file.replaceStatementId !== undefined ? ' · ersetzt bestehenden Import' : ''}
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">{open ? '▲' : '▼'}</span>
        </button>

        {file.fehler && (
          <Callout kind="hoch">
            <p className="font-semibold">Datei konnte nicht gelesen werden</p>
            <p className="mt-1 break-words text-xs">{file.fehler}</p>
          </Callout>
        )}

        {open && !file.fehler && (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Layout" value={parsed.layout} />
              <Info label="Summe Auswahl" value={formatEur(sum)} />
              <Info label="Anfangssaldo" value={parsed.startKontostand !== undefined ? formatEur(parsed.startKontostand) : '–'} />
              <Info label="Endsaldo" value={parsed.endKontostand !== undefined ? formatEur(parsed.endKontostand) : '–'} />
            </div>
            {parsed.warnings.map((w, i) => (
              <Callout key={i} kind={w.startsWith('Keine') ? 'hoch' : 'mittel'}>
                {w}
              </Callout>
            ))}
            {duplicates > 0 && <Callout kind="info">{duplicates} Buchung(en) sind bereits vorhanden und werden übersprungen.</Callout>}
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <button className="underline" onClick={() => onSelectAll(file.id, true)}>
                alle
              </button>
              <button className="underline" onClick={() => onSelectAll(file.id, false)}>
                keine
              </button>
              <button className="underline" onClick={() => setShowRaw((v) => !v)}>
                {showRaw ? 'Rohtext ausblenden' : 'Rohtext anzeigen'}
              </button>
              <button className="ml-auto text-rose-300 underline" onClick={() => onRemove(file.id)}>
                Datei entfernen
              </button>
            </div>
            {showRaw && <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-2 text-[11px] leading-snug text-slate-300">{file.rohtext}</pre>}
          </>
        )}
        {file.fehler && (
          <button className="text-xs text-rose-300 underline" onClick={() => onRemove(file.id)}>
            Datei entfernen
          </button>
        )}
      </div>

      {open && !file.fehler && (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.hash} className={`card p-3 ${i.duplikat ? 'opacity-50' : ''} ${i.vorzeichenUnsicher ? 'border-amber-500/50' : ''}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 accent-emerald-500"
                  disabled={i.duplikat}
                  checked={i.ausgewaehlt && !i.duplikat}
                  onChange={(e) => onUpdate(file.id, i.hash, { ausgewaehlt: e.target.checked })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{i.gegenpartei || i.buchungsart || '(ohne Text)'}</p>
                    <button
                      className="shrink-0 font-semibold"
                      title="Vorzeichen umkehren"
                      onClick={() => onUpdate(file.id, i.hash, { betrag: -i.betrag, vorzeichenUnsicher: false })}
                    >
                      <Money value={i.betrag} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    {formatDate(i.buchungsdatum)}
                    {i.buchungsart ? ` · ${i.buchungsart}` : ''}
                    {i.duplikat ? ' · bereits vorhanden' : ''}
                    {i.vorzeichenUnsicher ? ' · Vorzeichen unsicher (antippen zum Umkehren)' : ''}
                  </p>
                  {i.text && i.text !== i.gegenpartei && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{i.text}</p>}
                  {!i.duplikat && (
                    <CategorySelect
                      className="mt-2 py-1.5 text-sm"
                      categories={categories}
                      value={i.kategorieId}
                      onChange={(id) => onUpdate(file.id, i.hash, { kategorieId: id })}
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-slate-200">{value}</p>
    </div>
  )
}
