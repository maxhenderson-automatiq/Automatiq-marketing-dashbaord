import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, Cell,
} from 'recharts'
import ChartCard from '../components/ui/ChartCard'
import StatCard from '../components/ui/StatCard'
import {
  getNewContactsBySource,
  getOnboardedBySource,
  getPayingBySource,
  getFunnelTotals,
  getMonthlyFunnelTrend,
  enrichSource,
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
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

/** Enrich raw source rows from the service with display metadata */
function enrichRows(rows = []) {
  return rows.map(r => {
    const meta = enrichSource(r.source)
    return { ...r, ...meta }
  })
}

/** Merge two source arrays to compute per-channel conversion rates */
function mergeConversion(numeratorRows, denominatorRows) {
  const denomMap = Object.fromEntries((denominatorRows ?? []).map(r => [r.source, r.count]))
  return enrichRows(numeratorRows ?? [])
    .map(r => ({
      ...r,
      denom: denomMap[r.source] ?? 0,
      rate: denomMap[r.source] ? ((r.count / denomMap[r.source]) * 100) : 0,
    }))
    .filter(r => r.denom > 0)
    .sort((a, b) => b.rate - a.rate)
}

function InsightNote({ children }) {
  return <div className="insight-note">💡 {children}</div>
}

export default function HubSpotInsightsPage() {
  const [days, setDays] = useState(30)

  // Each query key includes `days` — React Query automatically refetches
  // when `days` changes. staleTime=0 ensures no stale data is served on
  // key change (avoids the appearance of the toggle doing nothing).
  const queryOpts = useCallback((key, fn) => ({
    queryKey: [key, days],
    queryFn: fn,
    staleTime: 0,            // always refetch when window changes
    gcTime: 5 * 60 * 1000,  // keep in cache 5 min after unmount
    keepPreviousData: true,  // show old data while new data loads (no flash to empty)
  }), [days])

  const { data: newContacts, isLoading: l1, isFetching: f1 } = useQuery(
    queryOpts('mktg-new-contacts', () => getNewContactsBySource(days))
  )

  const { data: onboarded, isLoading: l2, isFetching: f2 } = useQuery(
    queryOpts('mktg-onboarded', () => getOnboardedBySource(days))
  )

  const { data: paying, isLoading: l3, isFetching: f3 } = useQuery(
    queryOpts('mktg-paying', () => getPayingBySource(days))
  )

  const { data: funnel, isLoading: l4, isFetching: f4 } = useQuery(
    queryOpts('mktg-funnel', () => getFunnelTotals(days))
  )

  const { data: trend, isLoading: lTrend } = useQuery({
    queryKey: ['mktg-trend'],
    queryFn: getMonthlyFunnelTrend,
    staleTime: 10 * 60 * 1000,
  })

  const isFetching = f1 || f2 || f3 || f4

  // Enrich rows with label/color from enrichSource
  const newC = enrichRows(newContacts)
  const onb  = enrichRows(onboarded)
  const pay  = enrichRows(paying)

  // Conversion rate views
  const contactToOnboard = mergeConversion(onboarded, newContacts)
  const onboardToPaying  = mergeConversion(paying, onboarded)

  // Funnel shape for the visual funnel
  const funnelStages = funnel ? [
    { name: 'New Contacts',      value: funnel.newContacts,      fill: '#6366f1' },
    { name: 'Onboarded',         value: funnel.onboarded,        fill: '#f97316' },
    { name: 'Lysted Customers',  value: funnel.lystedCustomers,  fill: '#3b82f6' },
    { name: 'Paying Customers',  value: funnel.payingCustomers,  fill: '#22c55e' },
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
        {isFetching && <span className="insights-loading">⟳ Loading…</span>}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Marketing Attributed New Contacts
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">
          Section 1 — Marketing Attributed New Contacts (T{days})
        </h2>

        <InsightNote>
          Attribution model: <strong>drill-down source</strong> via{' '}
          <code>hs_analytics_source_data_1</code> — HubSpot's best true-channel field,
          giving the specific sub-source (e.g. "google", "facebook.com") rather than the
          broad bucket. T{days} window is applied to <strong>contact create date</strong>,
          so this measures <em>new contacts created</em> per channel.
        </InsightNote>
        <InsightNote>
          <strong>HubSpot does not track session-level data</strong> — it tracks contacts.
          Each contact is deduplicated by email. For session-level funnel rates (visits → lead)
          you need Pendo or GA4 cross-referenced against contact creation events.
        </InsightNote>

        <div className="insights-stats">
          <StatCard
            label={`New Contacts (T${days})`}
            value={fmt(funnel?.newContacts)}
            accent="blue"
          />
          <StatCard
            label="Top Channel"
            value={newC[0]?.short ?? '—'}
            sub={newC[0] ? fmt(newC[0].count) + ' contacts' : ''}
          />
          <StatCard
            label="#2 Channel"
            value={newC[1]?.short ?? '—'}
            sub={newC[1] ? fmt(newC[1].count) + ' contacts' : ''}
          />
          <StatCard
            label="Channels Tracked"
            value={fmt(newC.length)}
            sub="distinct source_data_1 values"
          />
        </div>

        <div className="insights-charts-row">
          <ChartCard title={`New Contacts by Channel (T${days})`} className="chart-tall">
            {l1 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, newC.length * 32)}>
                <BarChart data={newC} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="short" type="category" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v) => [fmt(v), 'New Contacts']} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {newC.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`Channel Share — New Contacts (T${days})`}>
            {l1 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : (
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
                        {r.short}
                      </span>
                      <span>{fmt(r.count)}</span>
                      <span>{pct(r.count, total)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — Onboarded per Channel
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">
          Section 2 — Onboarded per Channel (T{days})
        </h2>

        <InsightNote>
          "Onboarded" = contact has a value in{' '}
          <code>datateam_lysted_onboard_date__c</code> (75k+ records, actively updated).
          The T{days} window filters on this date. Attribution uses{' '}
          <code>hs_analytics_source_data_1</code> — the same drill-down field as Section 1.
        </InsightNote>
        <InsightNote>
          <strong>Contact → Onboard conversion rate</strong> is shown per channel below.
          This is the closest proxy to a registration funnel completion rate in HubSpot.
          For registration abandonment (people who started but didn't finish) you'd need
          Pendo funnel tracking on the signup flow pages.
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
            value={onb[0]?.short ?? '—'}
            sub={onb[0] ? fmt(onb[0].count) + ' onboarded' : ''}
            accent="orange"
          />
          <StatCard
            label="#2 Onboard Channel"
            value={onb[1]?.short ?? '—'}
            sub={onb[1] ? fmt(onb[1].count) + ' onboarded' : ''}
          />
        </div>

        <div className="insights-charts-row">
          <ChartCard title={`Onboarded by Channel (T${days})`} className="chart-tall">
            {l2 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, onb.length * 32)}>
                <BarChart data={onb} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="short" type="category" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v) => [fmt(v), 'Onboarded']} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {onb.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`Contact → Onboard Rate by Channel (T${days})`}>
            {l1 || l2 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : (
              <div className="channel-table">
                <div className="channel-table-header">
                  <span>Channel</span>
                  <span>Onboarded</span>
                  <span>Conv. %</span>
                </div>
                {contactToOnboard.length === 0 ? (
                  <div className="empty-state">No matching channels</div>
                ) : contactToOnboard.map((r) => (
                  <div key={r.source} className="channel-table-row">
                    <span className="channel-dot-label">
                      <span className="channel-dot" style={{ background: r.color }} />
                      {r.short}
                    </span>
                    <span>{fmt(r.count)}</span>
                    <span className={r.rate > 50 ? 'rate-high' : r.rate > 20 ? 'rate-mid' : 'rate-low'}>
                      {r.rate.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — Lysted & Paying Customers
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">
          Section 3 — Lysted &amp; Paying Customers
        </h2>

        <InsightNote>
          <strong>Lysted customer</strong> = <code>datateam_username_lysted</code> is present
          (synced from Redshift — authoritative).{' '}
          <strong>Paying customer</strong> = <code>datateam_lifetime_sales_lysted</code> &gt; 0.
          These counts are <em>all-time</em> totals, not windowed — paying status is a property,
          not an event with a datestamp. The T{days} window above filters new contacts &amp; onboards;
          Section 3 shows the overall conversion health of the Lysted customer base.
        </InsightNote>
        <InsightNote>
          Boolean signals from Redshift: <code>has_sold_ticket_lysted</code> (sold at least one
          ticket), <code>has_lysted_signup</code> (completed signup), and{' '}
          <code>has_lysted_onboarding</code> (completed onboarding flow). These are the most
          granular conversion indicators available.
        </InsightNote>

        <div className="insights-stats">
          <StatCard
            label="Lysted Customers (All Time)"
            value={fmt(funnel?.lystedCustomers)}
            sub="datateam_username_lysted present"
            accent="blue"
          />
          <StatCard
            label="Paying Customers (All Time)"
            value={fmt(funnel?.payingCustomers)}
            sub="lifetime_sales_lysted > 0"
            accent="green"
          />
          <StatCard
            label="Has Sold a Ticket"
            value={fmt(funnel?.hasSoldTicket)}
            sub="has_sold_ticket_lysted = true"
          />
          <StatCard
            label="Signed Up"
            value={fmt(funnel?.hasSignup)}
            sub="has_lysted_signup = true"
          />
        </div>

        <div className="insights-stats" style={{ marginTop: '-1rem' }}>
          <StatCard
            label="Lysted → Paying Rate"
            value={pct(funnel?.payingCustomers, funnel?.lystedCustomers)}
            sub={`${fmt(funnel?.payingCustomers)} of ${fmt(funnel?.lystedCustomers)} Lysted users`}
            accent="green"
          />
          <StatCard
            label="Contact → Paying Rate"
            value={pct(funnel?.payingCustomers, funnel?.newContacts)}
            sub={`T${days} new contacts vs all-time paying`}
          />
        </div>

        <div className="insights-charts-row">
          <ChartCard title="Full Conversion Funnel" className="chart-tall">
            {l4 ? (
              <div className="loading-placeholder">Loading funnel…</div>
            ) : (
              <div className="funnel-visual">
                {funnelStages.map((stage, i) => {
                  const max = funnelStages[0]?.value || 1
                  const widthPct = stage.value != null
                    ? Math.max(15, (stage.value / max) * 100)
                    : 50
                  const convRate = i > 0
                    ? pct(stage.value, funnelStages[i - 1].value)
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
            )}
          </ChartCard>

          <ChartCard title="Paying Customers by Channel (All Time)">
            {l3 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : pay.length > 0 ? (
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
                      {r.short}
                    </span>
                    <span>{fmt(r.count)}</span>
                    <span className={r.rate > 10 ? 'rate-high' : r.rate > 3 ? 'rate-mid' : 'rate-low'}>
                      {r.rate.toFixed(2)}%
                    </span>
                  </div>
                ))}
                {pay
                  .filter(r => !onboardToPaying.find(x => x.source === r.source))
                  .map(r => (
                    <div key={r.source} className="channel-table-row">
                      <span className="channel-dot-label">
                        <span className="channel-dot" style={{ background: r.color }} />
                        {r.short}
                      </span>
                      <span>{fmt(r.count)}</span>
                      <span className="rate-note">no onboard match</span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="empty-state">No paying customer channel data available</div>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          TREND — 6-month funnel trend
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">6-Month Funnel Trend</h2>
        <ChartCard title="New Contacts → Onboarded (Monthly)">
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
                <Line
                  type="monotone"
                  dataKey="newContacts"
                  name="New Contacts"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="onboarded"
                  name="Onboarded"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                />
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
              q: 'Registration abandonment rate',
              status: 'gap',
              note: 'Requires Pendo funnel tracking on the signup flow pages. The onboard date tells us who completed registration, not who started it.',
            },
            {
              q: 'Paying customer source attribution',
              status: 'warning',
              note: 'datateam_lifetime_sales_lysted > 0 identifies paying customers, but hs_analytics_source_data_1 may not accurately reflect their acquisition channel if it was set before the paid conversion. Cross-reference with Redshift for full attribution.',
            },
            {
              q: 'Session → listing conversion rate (new user who lists first item)',
              status: 'gap',
              note: 'Not available in HubSpot. Would need product event data (Pendo or custom analytics) tracking "sessions by new registrant with no listings who then lists".',
            },
            {
              q: 'True marketplace sell-through rate',
              status: 'gap',
              note: 'Not in HubSpot. Requires transactional data from the marketplace backend. has_sold_ticket_lysted is the closest proxy.',
            },
            {
              q: 'has_lysted_onboarding vs datateam_lysted_onboard_date__c difference',
              status: 'unclear',
              note: 'Both signal onboarding completion, but may differ if the boolean is set before Redshift syncs the date. The datateam_* date field (75k records) should be canonical per the data team.',
            },
            {
              q: 'T30/T60/T90 window for paying customers',
              status: 'answered',
              note: 'Paying customer counts (Section 3 stat cards) are all-time totals because datateam_lifetime_sales_lysted is a property, not a timestamped event. The T-window applies only to new contacts and onboards.',
            },
            {
              q: 'Source attribution accuracy for source_data_1',
              status: 'answered',
              note: 'hs_analytics_source_data_1 is now used as the drill-down attribution field per data team guidance. It provides specific sub-sources (e.g. "google", "facebook.com") rather than broad HubSpot source buckets.',
            },
          ].map((item) => (
            <div key={item.q} className={`gap-card gap-card--${item.status}`}>
              <div className="gap-card-header">
                <span className={`gap-badge gap-badge--${item.status}`}>
                  {item.status === 'gap'
                    ? '🔴 Gap'
                    : item.status === 'warning'
                    ? '🟡 Warning'
                    : item.status === 'unclear'
                    ? '🟠 Unclear'
                    : '🟢 Answered'}
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
