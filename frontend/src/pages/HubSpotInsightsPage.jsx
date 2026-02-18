import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, LabelList,
  LineChart, Line, Legend, Cell,
} from 'recharts'
import ChartCard from '../components/ui/ChartCard'
import StatCard from '../components/ui/StatCard'
import {
  getNewContactsBySource,
  getOnboardedBySource,
  getPayingBySource,
  getFunnelTotals,
  getMonthlyFunnelTrend,
  SOURCE_META,
} from '../services/hubspot/marketing'
import './HubSpotInsightsPage.css'

const WINDOW_OPTIONS = [
  { label: 'T30', days: 30 },
  { label: 'T60', days: 60 },
  { label: 'T90', days: 90 },
]

function pct(num, denom) {
  if (!denom) return '—'
  return `${((num / denom) * 100).toFixed(1)}%`
}

function fmt(n) {
  return n?.toLocaleString() ?? '—'
}

/** Merge source arrays from two datasets to compute a conversion rate per channel */
function mergeConversion(numeratorRows, denominatorRows) {
  const denomMap = Object.fromEntries((denominatorRows ?? []).map(r => [r.source, r.count]))
  return (numeratorRows ?? []).map(r => ({
    source: r.source,
    label: SOURCE_META[r.source]?.short ?? r.source,
    color: SOURCE_META[r.source]?.color ?? '#6366f1',
    count: r.count,
    denom: denomMap[r.source] ?? 0,
    rate: denomMap[r.source] ? ((r.count / denomMap[r.source]) * 100) : 0,
  })).filter(r => r.denom > 0)
}

// Recharts custom bar with source colour
function ColorBar(props) {
  const { x, y, width, height, color } = props
  return <rect x={x} y={y} width={width} height={height} fill={color} rx={3} />
}

function InsightNote({ children }) {
  return <div className="insight-note">💡 {children}</div>
}

export default function HubSpotInsightsPage() {
  const [days, setDays] = useState(30)

  const { data: newContacts, isLoading: l1 } = useQuery({
    queryKey: ['mktg-new-contacts', days],
    queryFn: () => getNewContactsBySource(days),
    staleTime: 5 * 60 * 1000,
  })

  const { data: onboarded, isLoading: l2 } = useQuery({
    queryKey: ['mktg-onboarded', days],
    queryFn: () => getOnboardedBySource(days),
    staleTime: 5 * 60 * 1000,
  })

  const { data: paying, isLoading: l3 } = useQuery({
    queryKey: ['mktg-paying', days],
    queryFn: () => getPayingBySource(days),
    staleTime: 5 * 60 * 1000,
  })

  const { data: funnel } = useQuery({
    queryKey: ['mktg-funnel', days],
    queryFn: () => getFunnelTotals(days),
    staleTime: 5 * 60 * 1000,
  })

  const { data: trend, isLoading: lTrend } = useQuery({
    queryKey: ['mktg-trend'],
    queryFn: getMonthlyFunnelTrend,
    staleTime: 10 * 60 * 1000,
  })

  const isLoading = l1 || l2 || l3

  // Enrich rows with colour for charts
  const enriched = (rows) => (rows ?? []).map(r => ({
    ...r,
    label: SOURCE_META[r.source]?.short ?? r.source,
    color: SOURCE_META[r.source]?.color ?? '#6366f1',
  }))

  const newC = enriched(newContacts)
  const onb  = enriched(onboarded)
  const pay  = enriched(paying)

  // Conversion rate rows
  const contactToOnboard = mergeConversion(onboarded, newContacts)
  const onboardToPaying  = mergeConversion(paying, onboarded)

  // Funnel data for the recharts FunnelChart
  const funnelData = funnel ? [
    { name: 'New Contacts',   value: funnel.newContacts, fill: '#6366f1' },
    { name: 'Onboarded',      value: funnel.onboarded,   fill: '#f97316' },
    { name: 'Paying Customer',value: funnel.paying,       fill: '#22c55e' },
  ] : []

  return (
    <div className="insights-page">

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="insights-controls">
        <span className="insights-controls-label">Time window:</span>
        {WINDOW_OPTIONS.map(opt => (
          <button
            key={opt.days}
            className={`window-btn ${days === opt.days ? 'window-btn--active' : ''}`}
            onClick={() => setDays(opt.days)}
          >
            {opt.label}
          </button>
        ))}
        {isLoading && <span className="insights-loading">Loading…</span>}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Marketing Attributed New Contacts
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">
          Section 1 — Marketing Attributed New Contacts
        </h2>

        <InsightNote>
          Attribution model: <strong>Original source</strong> (first touch) via HubSpot's
          <code>hs_analytics_source</code>. This is the channel that first brought the contact
          into HubSpot — not the channel of their most recent session. T30/T60/T90 windows
          are applied to <strong>contact create date</strong>, so this measures <em>new contacts
          created</em> per channel, not sessions or visits.
        </InsightNote>
        <InsightNote>
          <strong>HubSpot does not track session-level data</strong> — it tracks contacts.
          A "lead" here = a contact whose <code>lifecyclestage</code> is <code>lead</code> or higher.
          For session funnel conversion rates (visits → lead) you need Pendo or GA4 session data
          cross-referenced against contact creation events.
        </InsightNote>

        <div className="insights-stats">
          <StatCard
            label={`New Contacts (T${days})`}
            value={fmt(funnel?.newContacts)}
            accent="blue"
          />
          <StatCard
            label="Top Channel"
            value={newC[0]?.label ?? '—'}
            sub={newC[0] ? fmt(newC[0].count) + ' contacts' : ''}
          />
          <StatCard
            label="Paid Search"
            value={fmt(newC.find(r => r.source === 'PAID_SEARCH')?.count)}
            sub="Original source"
            accent="blue"
          />
          <StatCard
            label="Organic Search"
            value={fmt(newC.find(r => r.source === 'ORGANIC_SEARCH')?.count)}
            sub="Original source"
            accent="green"
          />
        </div>

        <div className="insights-charts-row">
          <ChartCard title={`New Contacts by Channel (T${days})`} className="chart-tall">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={newC} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(v) => [fmt(v), 'New Contacts']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {newC.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Channel Share — New Contacts (T${days})`}>
            <div className="channel-table">
              <div className="channel-table-header">
                <span>Channel</span>
                <span>Count</span>
                <span>Share</span>
              </div>
              {newC.map((r) => {
                const total = newC.reduce((s, x) => s + x.count, 0)
                return (
                  <div key={r.source} className="channel-table-row">
                    <span className="channel-dot-label">
                      <span className="channel-dot" style={{ background: r.color }} />
                      {r.label}
                    </span>
                    <span>{fmt(r.count)}</span>
                    <span>{pct(r.count, total)}</span>
                  </div>
                )
              })}
            </div>
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — Onboarded per Channel
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">
          Section 2 — Onboarded per Channel
        </h2>

        <InsightNote>
          "Onboarded" = contact has a value in <code>datateam_lysted_onboard_date__c</code>
          (75k+ records, actively updated today). The T{days} window filters on this date field.
          Attribution is still first-touch (<code>hs_analytics_source</code>).
        </InsightNote>
        <InsightNote>
          <strong>Contact → Onboard conversion rate</strong> is calculated below per channel.
          This is the closest proxy to a registration funnel — but note it measures contacts who
          eventually onboarded, not session-level abandonment within the registration flow.
          For true registration abandonment you'd need Pendo funnel data on the signup flow pages.
        </InsightNote>

        <div className="insights-stats">
          <StatCard
            label={`Onboarded (T${days})`}
            value={fmt(funnel?.onboarded)}
            accent="orange"
          />
          <StatCard
            label="Contact → Onboard Rate"
            value={pct(funnel?.onboarded, funnel?.newContacts)}
            sub={`${fmt(funnel?.onboarded)} of ${fmt(funnel?.newContacts)}`}
          />
          <StatCard
            label="Top Onboard Channel"
            value={onb[0]?.label ?? '—'}
            sub={onb[0] ? fmt(onb[0].count) + ' onboarded' : ''}
            accent="orange"
          />
          <StatCard
            label="Paid Search Onboarded"
            value={fmt(onb.find(r => r.source === 'PAID_SEARCH')?.count)}
            sub="Original source"
          />
        </div>

        <div className="insights-charts-row">
          <ChartCard title={`Onboarded by Channel (T${days})`} className="chart-tall">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={onb} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(v) => [fmt(v), 'Onboarded']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {onb.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Contact → Onboard Rate by Channel (T${days})`}>
            <div className="channel-table">
              <div className="channel-table-header">
                <span>Channel</span>
                <span>Onboarded</span>
                <span>Conv. %</span>
              </div>
              {contactToOnboard.map((r) => (
                <div key={r.source} className="channel-table-row">
                  <span className="channel-dot-label">
                    <span className="channel-dot" style={{ background: r.color }} />
                    {r.label}
                  </span>
                  <span>{fmt(r.count)}</span>
                  <span className={r.rate > 50 ? 'rate-high' : r.rate > 20 ? 'rate-mid' : 'rate-low'}>
                    {r.rate.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — Paying Customers per Channel
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">
          Section 3 — Paying Customers per Channel
        </h2>

        <InsightNote>
          "Paying customer" = contact has a value in <code>datateam_dataiq_conversion_paid_date</code>
          (878 total records). Paid type is <code>pro</code> or <code>premium</code>. The T{days}
          window filters on the paid conversion date — so this measures <em>new paying conversions</em>
          in the window, not total paying customers.
        </InsightNote>
        <InsightNote>
          <strong>Currently almost all paying conversions are tagged as OFFLINE.</strong> This likely
          means the paid conversion event is being written back to HubSpot from an internal system
          without preserving the original UTM/source, or these users converted through a
          non-web-tracked channel. The onboard → paying conversion rate below reflects this gap.
        </InsightNote>

        <div className="insights-stats">
          <StatCard
            label={`New Paying (T${days})`}
            value={fmt(funnel?.paying)}
            accent="green"
          />
          <StatCard
            label="Onboard → Paying Rate"
            value={pct(funnel?.paying, funnel?.onboarded)}
            sub={`${fmt(funnel?.paying)} of ${fmt(funnel?.onboarded)}`}
            accent="green"
          />
          <StatCard
            label="Contact → Paying Rate"
            value={pct(funnel?.paying, funnel?.newContacts)}
            sub="End-to-end conversion"
          />
          <StatCard
            label="Total Paying (All Time)"
            value="878"
            sub="datateam_dataiq_conversion_paid_date"
          />
        </div>

        <div className="insights-charts-row">
          <ChartCard title="Full Conversion Funnel" className="chart-tall">
            <div className="funnel-visual">
              {funnelData.map((stage, i) => {
                const max = funnelData[0]?.value || 1
                const widthPct = Math.max(20, (stage.value / max) * 100)
                const convRate = i > 0
                  ? pct(stage.value, funnelData[i - 1].value)
                  : null
                return (
                  <div key={stage.name} className="funnel-stage">
                    {convRate && (
                      <div className="funnel-arrow">↓ {convRate} conversion</div>
                    )}
                    <div
                      className="funnel-bar"
                      style={{ width: `${widthPct}%`, background: stage.fill }}
                    >
                      <span className="funnel-bar-label">{stage.name}</span>
                      <span className="funnel-bar-value">{fmt(stage.value)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </ChartCard>

          <ChartCard title={`Paying Customers by Channel (T${days})`}>
            {pay.length > 0 ? (
              <div className="channel-table">
                <div className="channel-table-header">
                  <span>Channel</span>
                  <span>Paying</span>
                  <span>Conv. %</span>
                </div>
                {onboardToPaying.map((r) => (
                  <div key={r.source} className="channel-table-row">
                    <span className="channel-dot-label">
                      <span className="channel-dot" style={{ background: r.color }} />
                      {r.label}
                    </span>
                    <span>{fmt(r.count)}</span>
                    <span>{r.rate.toFixed(2)}%</span>
                  </div>
                ))}
                {pay.filter(r => !onboardToPaying.find(x => x.source === r.source)).map(r => (
                  <div key={r.source} className="channel-table-row">
                    <span className="channel-dot-label">
                      <span className="channel-dot" style={{ background: r.color }} />
                      {r.label}
                    </span>
                    <span>{fmt(r.count)}</span>
                    <span className="rate-note">no onboard match</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No paying conversions in this window</div>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          TREND — 6-month funnel trend
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">6-Month Funnel Trend</h2>
        <ChartCard title="New Contacts → Onboarded → Paying (Monthly)">
          {lTrend ? (
            <div className="loading-placeholder">Loading 6-month trend…</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="newContacts" name="New Contacts" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="onboarded"   name="Onboarded"    stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="paying"      name="Paying"       stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          GAPS — What we can't answer yet
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">📋 Open Questions &amp; Data Gaps</h2>
        <div className="gaps-grid">
          {[
            {
              q: 'Session-level visits → lead conversion rate',
              status: 'gap',
              note: 'HubSpot tracks contacts, not sessions. Need GA4 or Pendo session data cross-referenced with contact createdate to get this rate.',
            },
            {
              q: 'Deduplication of visits (are returning visitors counted?)',
              status: 'gap',
              note: 'HubSpot deduplicates contacts by email — so each contact is counted once regardless of visit count. Sessions are not tracked here.',
            },
            {
              q: 'Registration abandonment rate',
              status: 'gap',
              note: 'Requires Pendo funnel tracking on the signup flow pages. The onboard date tells us who completed registration, not who started it.',
            },
            {
              q: '"Paying" definition: first listing vs. first sale',
              status: 'unclear',
              note: 'datateam_dataiq_conversion_paid_date appears to track the paid subscription date. Whether this = first listing or first sale requires confirmation with the data team.',
            },
            {
              q: 'Session → listing conversion rate (new user who lists first item)',
              status: 'gap',
              note: 'Not available in HubSpot. Would need product event data (Pendo or custom analytics) to track "sessions by new registrant with no listings who then lists".',
            },
            {
              q: 'True marketplace sell-through rate',
              status: 'gap',
              note: 'Not in HubSpot. This requires transactional data from your marketplace backend.',
            },
            {
              q: 'Paying customer channel attribution accuracy',
              status: 'warning',
              note: 'Currently ~100% of paying conversions show as OFFLINE source. This is likely a writeback issue — the paid conversion is being recorded without preserving UTM/source from the original contact journey.',
            },
            {
              q: 'T30 vs MTD for all metrics',
              status: 'answered',
              note: 'All metrics above are T30 (trailing 30 days from today). Use the time window toggle to switch to T60/T90. MTD is not a separate view but can be added.',
            },
          ].map((item) => (
            <div key={item.q} className={`gap-card gap-card--${item.status}`}>
              <div className="gap-card-header">
                <span className={`gap-badge gap-badge--${item.status}`}>
                  {item.status === 'gap' ? '🔴 Gap' : item.status === 'warning' ? '🟡 Warning' : item.status === 'unclear' ? '🟠 Unclear' : '🟢 Answered'}
                </span>
                <span className="gap-question">{item.q}</span>
              </div>
              <p className="gap-note">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
