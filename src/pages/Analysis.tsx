import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAppData } from '../hooks/useData'
import { formatDate, formatDateShort, formatEur, formatMonth, formatMonthShort } from '../lib/format'
import { Callout, EmptyState, Money, PageHeader, ProgressBar, Section } from '../components/ui'
import { CATEGORY_TYPE_LABELS } from '../categorize/defaultRules'
import type { CategoryType } from '../db/types'

const RANGE_OPTIONS = [
  { label: '3 M', months: 3 },
  { label: '6 M', months: 6 },
  { label: '12 M', months: 12 },
  { label: 'Alles', months: 0 },
]

export function Analysis() {
  const { loading, transactions, debt, recurring, categoryById, settings } = useAppData()
  const [range, setRange] = useState(6)

  const months = useMemo(() => (range ? debt.months.slice(-range) : debt.months), [debt.months, range])
  const firstMonth = months[0]?.monat
  const series = useMemo(
    () => (firstMonth ? debt.series.filter((p) => p.datum >= `${firstMonth}-01`) : debt.series),
    [debt.series, firstMonth],
  )

  if (loading) return <PageHeader title="Analyse" />
  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Analyse" />
        <div className="mx-auto max-w-lg px-4 pt-4">
          <EmptyState title="Noch keine Daten" text="Importiere zuerst einen Kontoauszug." />
        </div>
      </div>
    )
  }

  const fixItems = recurring.filter((r) => r.aktiv && r.betrag < 0)
  const incomeItems = recurring.filter((r) => r.aktiv && r.betrag > 0)
  const fixSum = fixItems.reduce((s, r) => s + r.monatlich, 0)

  return (
    <div>
      <PageHeader
        title="Analyse"
        subtitle="Wo und warum entstehen Schulden?"
        right={
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.label}
                className={`rounded-lg px-2 py-1 text-xs ${range === o.months ? 'bg-emerald-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300'}`}
                onClick={() => setRange(o.months)}
              >
                {o.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="mx-auto max-w-lg px-4 pt-4">
        {/* Findings */}
        <Section title="Erkenntnisse">
          <div className="space-y-2">
            {debt.findings.map((f, i) => (
              <Callout key={i} kind={f.schwere}>
                <p className="font-semibold">{f.titel}</p>
                <p className="mt-0.5 text-xs opacity-90">{f.text}</p>
              </Callout>
            ))}
          </div>
        </Section>

        {/* Saldoverlauf */}
        <Section title="Kontostand-Verlauf">
          <div className="card">
            {series.length < 2 ? (
              <p className="text-sm text-slate-500">Zu wenig Datenpunkte. Der Verlauf braucht einen Kontostand aus einem Auszug.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="datum" tickFormatter={formatDateShort} tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={48} tickFormatter={(v: number) => `${Math.round(v)}`} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
                      labelFormatter={(l) => formatDate(String(l))}
                      formatter={(v) => [formatEur(Number(v)), 'Saldo']}
                    />
                    <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="4 4" />
                    {settings.dispoLimit > 0 && <ReferenceLine y={-settings.dispoLimit} stroke="#f97316" strokeDasharray="2 4" label={{ value: 'Dispolimit', fontSize: 10, fill: '#f97316', position: 'insideBottomRight' }} />}
                    <Area type="monotone" dataKey="saldo" stroke="#10b981" fill="url(#saldoFill)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-xs text-slate-500">Tage im Minus</p>
                <p className={`font-semibold ${debt.tageImMinus > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{debt.tageImMinus}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Tiefstand</p>
                <p className="font-semibold">{debt.tiefstand ? <Money value={debt.tiefstand.saldo} /> : '–'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Dispo-Phasen</p>
                <p className="font-semibold">{debt.episoden.length}</p>
              </div>
            </div>
          </div>
        </Section>

        {debt.episoden.length > 0 && (
          <Section title="Phasen im Minus">
            <ul className="card divide-y divide-slate-800 p-0">
              {[...debt.episoden].reverse().map((e, i) => (
                <li key={i} className="px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span>
                      {formatDateShort(e.von)} – {formatDate(e.bis)}
                    </span>
                    <span className="text-slate-400">
                      {e.tage} Tage · Tief <Money value={e.tiefstand} />
                    </span>
                  </div>
                  {e.verursacher.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      Größte Posten: {e.verursacher.map((v) => `${v.name} ${formatEur(v.summe, { abs: true })}`).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Monatsvergleich */}
        <Section title="Einnahmen vs. Ausgaben">
          <div className="card">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="monat" tickFormatter={formatMonthShort} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={48} tickFormatter={(v: number) => `${Math.round(v)}`} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(l) => formatMonth(String(l))}
                    formatter={(v, name) => [formatEur(Number(v)), String(name)]}
                  />
                  <Bar dataKey="einnahmen" name="Einnahmen" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="fix" name="Fixkosten" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="variabel" name="Variabel" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="schulden" name="Schuldenkosten" stackId="a" fill="#ef4444" />
                  <Bar dataKey="sonstiges" name="Sonstiges" stackId="a" fill="#64748b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 divide-y divide-slate-800 text-sm">
              {[...months].reverse().map((m) => (
                <li key={m.monat} className="flex items-center justify-between py-2">
                  <span className={m.defizit ? 'text-rose-300' : ''}>{formatMonth(m.monat)}</span>
                  <span className="flex gap-3 text-xs text-slate-400">
                    <span>
                      + <Money value={m.einnahmen} colored={false} />
                    </span>
                    <span>
                      − <Money value={m.ausgaben} colored={false} />
                    </span>
                    <Money value={m.saldo} className="w-20 text-right font-semibold" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* Verursacher-Ranking */}
        <Section title="Wo geht das Geld hin?">
          <div className="card space-y-3">
            {debt.categories.slice(0, 12).map((c) => (
              <div key={c.kategorieId ?? 'none'}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.farbe }} />
                    {c.name}
                    <span className="text-[10px] uppercase text-slate-500">{CATEGORY_TYPE_LABELS[c.typ as CategoryType]}</span>
                  </span>
                  <span className="text-right">
                    <span className="font-semibold tabular-nums">{formatEur(c.summe, { abs: true })}</span>
                    <span className="ml-1 text-xs text-slate-500">{Math.round(c.anteil * 100)} %</span>
                  </span>
                </div>
                <div className="mt-1">
                  <ProgressBar value={c.anteil} max={1} color={c.farbe} />
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Ø {formatEur(c.proMonat, { abs: true })}/Monat · {c.anzahl} Buchungen
                  {c.trend !== undefined && (
                    <span className={c.trend > 0.15 ? 'text-rose-400' : c.trend < -0.15 ? 'text-emerald-400' : ''}>
                      {' '}
                      · Trend {c.trend >= 0 ? '+' : ''}
                      {Math.round(c.trend * 100)} %
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* Schuldenkosten */}
        <Section title="Reine Schuldenkosten">
          <div className="card">
            {debt.schuldenkosten.gesamt === 0 ? (
              <p className="text-sm text-emerald-400">Keine Dispozinsen, Gebühren oder Raten erkannt.</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-rose-400">{formatEur(debt.schuldenkosten.gesamt, { abs: true })}</p>
                <p className="text-xs text-slate-400">Geld, das nur für Zinsen, Gebühren und Raten abgeflossen ist.</p>
                <ul className="mt-3 divide-y divide-slate-800 text-sm">
                  {debt.schuldenkosten.nachKategorie.map((k) => (
                    <li key={k.name} className="flex justify-between py-2">
                      <span>
                        {k.name} <span className="text-xs text-slate-500">({k.anzahl}×)</span>
                      </span>
                      <span className="tabular-nums">{formatEur(k.summe, { abs: true })}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Section>

        {/* Fixkosten */}
        <Section title="Wiederkehrende Kosten (Fixkosten, Abos, Raten)">
          <div className="card">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm text-slate-400">{fixItems.length} Posten</span>
              <span className="text-lg font-semibold">
                <Money value={fixSum} /> <span className="text-xs text-slate-500">/ Monat</span>
              </span>
            </div>
            {debt.fixkostenQuote !== undefined && (
              <>
                <ProgressBar value={debt.fixkostenQuote} max={1} color={debt.fixkostenQuote > 0.7 ? '#ef4444' : debt.fixkostenQuote > 0.55 ? '#f59e0b' : '#10b981'} />
                <p className="mb-3 mt-1 text-xs text-slate-500">{Math.round(debt.fixkostenQuote * 100)} % deiner Einnahmen sind fest verplant.</p>
              </>
            )}
            <ul className="divide-y divide-slate-800 text-sm">
              {fixItems.map((r) => (
                <li key={r.key} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <p className="truncate">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {r.intervall} · {r.anzahl}× · um den {r.erwarteterTag}.
                      {r.kategorieId !== undefined && categoryById.get(r.kategorieId) ? ` · ${categoryById.get(r.kategorieId)!.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <Money value={r.betrag} />
                    {r.intervall !== 'monatlich' && <p className="text-[11px] text-slate-500">≈ {formatEur(r.monatlich)}/Monat</p>}
                  </div>
                </li>
              ))}
              {fixItems.length === 0 && <li className="py-2 text-slate-500">Noch keine wiederkehrenden Kosten erkannt – dafür braucht es mindestens zwei Monate Daten.</li>}
            </ul>
            {incomeItems.length > 0 && (
              <>
                <p className="mt-4 mb-1 text-xs uppercase tracking-wide text-slate-500">Regelmäßige Einnahmen</p>
                <ul className="divide-y divide-slate-800 text-sm">
                  {incomeItems.map((r) => (
                    <li key={r.key} className="flex items-center justify-between py-2">
                      <span className="truncate">
                        {r.name} <span className="text-xs text-slate-500">· {r.intervall} · um den {r.erwarteterTag}.</span>
                      </span>
                      <Money value={r.betrag} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
