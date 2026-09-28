import { Link } from 'react-router-dom'
import { useAppData } from '../hooks/useData'
import { formatDate, formatDateShort, formatEur, formatMonth, monthKeyOf, parseIso, todayIso } from '../lib/format'
import { Callout, EmptyState, Money, PageHeader, ProgressBar, Section } from '../components/ui'

export function Dashboard() {
  const { loading, transactions, budget, debt, categoryById, recurring } = useAppData()
  const today = todayIso()

  if (loading) return <PageHeader title="SchuldenAnalyse" />

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="SchuldenAnalyse" subtitle="Alles bleibt auf deinem Gerät" />
        <div className="mx-auto max-w-lg px-4 pt-4">
          <EmptyState title="Willkommen" text="Importiere deinen ersten Sparkasse-Kontoauszug (PDF), um zu sehen, wo dein Geld hingeht und wie viel du diesen Monat noch ausgeben kannst.">
            <Link to="/import" className="btn-primary">
              Kontoauszug importieren
            </Link>
          </EmptyState>
        </div>
      </div>
    )
  }

  const monthDays = (() => {
    const von = parseIso(budget.monatVon)!
    const bis = parseIso(budget.monatBis)!
    return Math.round((bis.getTime() - von.getTime()) / 86_400_000) + 1
  })()
  const dayIndex = monthDays - budget.tageVerbleibend + 1
  const isMinus = budget.kontostand !== undefined && budget.kontostand < 0
  const thisMonth = debt.months.find((m) => m.monat === monthKeyOf(today))
  const lastMonth = debt.months.filter((m) => m.monat < monthKeyOf(today)).slice(-1)[0]
  const topFindings = debt.findings.filter((f) => f.schwere !== 'info').slice(0, 3)

  return (
    <div>
      <PageHeader title="Übersicht" subtitle={`${formatMonth(monthKeyOf(budget.monatVon))} · Tag ${dayIndex} von ${monthDays}`} />
      <div className="mx-auto max-w-lg px-4 pt-4">
        {/* Hauptkennzahl */}
        <div className={`card mb-4 ${isMinus ? 'border-rose-500/50' : budget.freiVerfuegbar === 0 ? 'border-amber-500/50' : 'border-emerald-500/40'}`}>
          <p className="text-xs uppercase tracking-wide text-slate-400">Diesen Monat noch frei verfügbar – ohne Schulden</p>
          {budget.freiVerfuegbar !== undefined ? (
            <>
              <p className={`mt-1 text-5xl font-bold tabular-nums ${budget.freiVerfuegbar > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatEur(budget.freiVerfuegbar)}
              </p>
              {budget.rechnerisch !== undefined && budget.rechnerisch < 0 && (
                <p className="mt-1 text-sm text-rose-300">Rechnerisch {formatEur(budget.rechnerisch)} – jede weitere Ausgabe geht in den Dispo.</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Stat label="Pro Tag" value={budget.tagesbudget !== undefined ? formatEur(budget.tagesbudget) : '–'} sub={`${budget.tageVerbleibend} Tage bis ${formatDateShort(budget.monatBis)}`} />
                <Stat
                  label="Kontostand"
                  value={budget.kontostand !== undefined ? formatEur(budget.kontostand) : '–'}
                  sub={budget.kontostandDatum ? `Stand ${formatDate(budget.kontostandDatum)}${budget.kontostandQuelle === 'manuell' ? ' (manuell)' : ''}` : ''}
                  valueClass={isMinus ? 'text-rose-400' : ''}
                />
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <Row label="Kontostand" value={budget.kontostand!} />
                <Row label="Noch erwartete Fixkosten" value={budget.ausstehendeFixkosten} muted={budget.ausstehendeFixkosten === 0} />
                {budget.puffer > 0 && <Row label="Sicherheitspuffer" value={-budget.puffer} />}
                <div className="border-t border-slate-800 pt-1">
                  <Row label="Frei verfügbar" value={budget.rechnerisch!} bold />
                </div>
                {budget.erwarteteEinnahmen > 0 && (
                  <p className="pt-1 text-xs text-slate-400">
                    Noch erwartete Einnahmen (nicht eingerechnet): <Money value={budget.erwarteteEinnahmen} />
                    {budget.erwarteteEinnahmenListe.length ? ` – ${budget.erwarteteEinnahmenListe.map((e) => e.name).join(', ')}` : ''}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-slate-300">Kontostand unbekannt.</p>
          )}
        </div>

        {budget.hinweise.map((h, i) => (
          <div key={i} className="mb-2">
            <Callout kind={h.includes('Dispo') || h.includes('übersteigen') ? 'hoch' : 'info'}>
              {h}
              {h.startsWith('Kein Kontostand') || h.includes('Tage alt') ? (
                <>
                  {' '}
                  <Link to="/einstellungen" className="underline">
                    Einstellungen
                  </Link>
                </>
              ) : null}
            </Callout>
          </div>
        ))}

        {/* Monatsfortschritt */}
        <Section title="Dieser Monat">
          <div className="card space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Einnahmen</span>
              <Money value={budget.einnahmenBisher} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Ausgaben</span>
              <Money value={-budget.ausgabenBisher} />
            </div>
            <ProgressBar value={budget.ausgabenBisher} max={Math.max(budget.einnahmenBisher, budget.ausgabenBisher, 1)} color={budget.ausgabenBisher > budget.einnahmenBisher ? '#f43f5e' : '#10b981'} />
            <p className="text-xs text-slate-500">
              {budget.anzahlBuchungen} Buchungen seit {formatDate(budget.monatVon)}
              {budget.datenStand ? ` · letzte Buchung ${formatDate(budget.datenStand)}` : ''}
            </p>
            {thisMonth && thisMonth.schulden > 0 && (
              <p className="text-xs text-rose-300">Davon reine Schuldenkosten (Zinsen, Gebühren, Raten): {formatEur(thisMonth.schulden, { abs: true })}</p>
            )}
          </div>
        </Section>

        {/* Ausstehende Fixkosten */}
        {budget.ausstehend.length > 0 && (
          <Section title="Noch erwartet in diesem Monat">
            <ul className="card divide-y divide-slate-800 p-0">
              {budget.ausstehend.map((p, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.ueberfaellig ? 'überfällig · ' : ''}erwartet um den {p.erwarteterTag}.
                      {p.kategorieId !== undefined && categoryById.get(p.kategorieId) ? ` · ${categoryById.get(p.kategorieId)!.name}` : ''}
                    </p>
                  </div>
                  <Money value={p.betrag} className="shrink-0" />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Warnhinweise aus der Analyse */}
        {topFindings.length > 0 && (
          <Section
            title="Warum entstehen Schulden?"
            action={
              <Link to="/analyse" className="text-xs text-emerald-400 underline">
                Alle Details
              </Link>
            }
          >
            <div className="space-y-2">
              {topFindings.map((f, i) => (
                <Callout key={i} kind={f.schwere}>
                  <p className="font-semibold">{f.titel}</p>
                  <p className="mt-0.5 text-xs opacity-90">{f.text}</p>
                </Callout>
              ))}
            </div>
          </Section>
        )}

        {/* Letzter Monat */}
        {lastMonth && (
          <Section title={`Rückblick ${formatMonth(lastMonth.monat)}`}>
            <div className="card grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-xs text-slate-500">Einnahmen</p>
                <Money value={lastMonth.einnahmen} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Ausgaben</p>
                <Money value={-lastMonth.ausgaben} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Ergebnis</p>
                <Money value={lastMonth.saldo} className="font-semibold" />
              </div>
            </div>
          </Section>
        )}

        {recurring.filter((r) => r.aktiv && r.betrag < 0).length > 0 && (
          <Section title="Fixkosten pro Monat">
            <div className="card flex items-baseline justify-between">
              <span className="text-sm text-slate-400">{recurring.filter((r) => r.aktiv && r.betrag < 0).length} wiederkehrende Posten</span>
              <Money value={recurring.filter((r) => r.aktiv && r.betrag < 0).reduce((s, r) => s + r.monatlich, 0)} className="text-lg font-semibold" />
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, valueClass = '' }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl bg-slate-800/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

function Row({ label, value, bold = false, muted = false }: { label: string; value: number; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''} ${muted ? 'text-slate-500' : ''}`}>
      <span className="text-slate-400">{label}</span>
      <Money value={value} colored={!muted} />
    </div>
  )
}
