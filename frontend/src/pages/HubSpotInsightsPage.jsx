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

// ─── Constants ────────────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [
  { label: 'T30', days: 30 },
  { label: 'T60', days: 60 },
  { label: 'T90', days: 90 },
]

const MIN_COUNT_OPTIONS = [
  { label: 'All', value: 0 },
  { label: '≥5',  value: 5 },
  { label: '≥10', value: 10 },
  { label: '≥25', value: 25 },
]

const TOP_N_OPTIONS = [
  { label: 'All',    value: 0 },
  { label: 'Top 5',  value: 5 },
  { label: 'Top 10', value: 10 },
]

const SORT_OPTIONS = [
  { label: 'Count ↓', value: 'count' },
  { label: 'Rate ↓',  value: 'rate'  },
  { label: 'A–Z',     value: 'alpha' },
]

const SOURCE_TYPE_OPTIONS = [
  { label: 'Paid',    value: 'paid'    },
  { label: 'Organic', value: 'organic' },
  { label: 'Other',   value: 'other'   },
]

const RATE_FLOOR_OPTIONS = [
  { label: 'Any',  value: 0  },
  { label: '>1%',  value: 1  },
  { label: '>5%',  value: 5  },
  { label: '>10%', value: 10 },
]

// Default filter values — used for "reset" comparison
const DEFAULT_FILTERS = {
  minCount:    5,
  topN:        10,
  sortBy:      'count',
  sourceTypes: ['paid', 'organic', 'other'],
  rateFloor:   0,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(num, denom) {
  if (!denom) return '—'
  return `${((num / denom) * 100).toFixed(1)}%`
}

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

/** Enrich raw service rows with display metadata */
function enrichRows(rows = []) {
  return rows.map(r => {
    const meta = enrichSource(r.source)
    return { ...r, ...meta }
  })
}

/** Classify a raw source string into paid / organic / other */
function classifySource(src = '') {
  const s = src.toLowerCase()
  // Paid = recognised ad platform names without a TLD
  if (/^(google|bing|facebook|instagram|twitter|tiktok|snapchat|pinterest|linkedin)$/.test(s))
    return 'paid'
  // Organic = TLD-style domains, direct, email, referral
  if (s.includes('.com') || s.includes('.org') || s.includes('.io') ||
      s === 'direct' || s === 'email' || s.includes('referral') || s.includes('organic'))
    return 'organic'
  return 'other'
}

/** Apply all active filters to an enriched row array */
function applyFilters(rows, { minCount, sourceTypes, topN, sortBy }) {
  let r = [...rows]

  // 1. Min count
  if (minCount > 0) r = r.filter(x => x.count >= minCount)

  // 2. Source type
  const all = SOURCE_TYPE_OPTIONS.every(o => sourceTypes.includes(o.value))
  if (!all) r = r.filter(x => sourceTypes.includes(classifySource(x.source)))

  // 3. Sort
  if (sortBy === 'alpha') r.sort((a, b) => a.short.localeCompare(b.short))
  else if (sortBy === 'rate') r.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
  // 'count' is already sorted desc by the service

  // 4. Top N (after sort)
  if (topN > 0) r = r.slice(0, topN)

  return r
}

/** Merge two source arrays to compute per-channel conversion rates */
function mergeConversion(numeratorRows, denominatorRows) {
  const denomMap = Object.fromEntries((denominatorRows ?? []).map(r => [r.source, r.count]))
  return enrichRows(numeratorRows ?? [])
    .map(r => ({
      ...r,
      denom: denomMap[r.source] ?? 0,
      rate:  denomMap[r.source] ? ((r.count / denomMap[r.source]) * 100) : 0,
    }))
    .filter(r => r.denom > 0)
    .sort((a, b) => b.rate - a.rate)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InsightNote({ children }) {
  return <div className="insight-note">💡 {children}</div>
}

/** Single filter group: label + a row of toggle buttons */
function FilterGroup({ label, options, value, onChange, multi = false }) {
  function toggle(v) {
    if (!multi) return onChange(v)
    const current = Array.isArray(value) ? value : [value]
    if (current.includes(v)) {
      // Don't allow deselecting the last one
      if (current.length === 1) return
      onChange(current.filter(x => x !== v))
    } else {
      onChange([...current, v])
    }
  }

  const isActive = (v) =>
    multi ? (Array.isArray(value) ? value.includes(v) : false) : value === v

  return (
    <div className="filter-group">
      <span className="filter-group-label">{label}</span>
      <div className="filter-group-btns">
        {options.map(opt => (
          <button
            key={opt.value}
            className={`window-btn ${isActive(opt.value) ? 'window-btn--active' : ''}`}
            onClick={() => toggle(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HubSpotInsightsPage() {
  // Time window
  const [days, setDays] = useState(30)

  // Filters
  const [minCount,    setMinCount]    = useState(DEFAULT_FILTERS.minCount)
  const [topN,        setTopN]        = useState(DEFAULT_FILTERS.topN)
  const [sortBy,      setSortBy]      = useState(DEFAULT_FILTERS.sortBy)
  const [sourceTypes, setSourceTypes] = useState(DEFAULT_FILTERS.sourceTypes)
  const [rateFloor,   setRateFloor]   = useState(DEFAULT_FILTERS.rateFloor)

  const filtersActive =
    minCount    !== DEFAULT_FILTERS.minCount    ||
    topN        !== DEFAULT_FILTERS.topN        ||
    sortBy      !== DEFAULT_FILTERS.sortBy      ||
    rateFloor   !== DEFAULT_FILTERS.rateFloor   ||
    sourceTypes.length !== DEFAULT_FILTERS.sourceTypes.length

  function resetFilters() {
    setMinCount(DEFAULT_FILTERS.minCount)
    setTopN(DEFAULT_FILTERS.topN)
    setSortBy(DEFAULT_FILTERS.sortBy)
    setSourceTypes(DEFAULT_FILTERS.sourceTypes)
    setRateFloor(DEFAULT_FILTERS.rateFloor)
  }

  const filterState = { minCount, topN, sortBy, sourceTypes }

  // Queries — staleTime=0 so React Query always refetches when days changes
  const queryOpts = useCallback((key, fn) => ({
    queryKey: [key, days],
    queryFn: fn,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    keepPreviousData: true,
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

  // Enrich raw rows
  const newC = enrichRows(newContacts)
  const onb  = enrichRows(onboarded)
  const pay  = enrichRows(paying)

  // Apply filters
  const filteredNewC = applyFilters(newC, filterState)
  const filteredOnb  = applyFilters(onb,  filterState)
  const filteredPay  = applyFilters(pay,  filterState)

  // Conversion tables — filter + optional rate floor
  const contactToOnboard = mergeConversion(onboarded, newContacts)
  const onboardToPaying  = mergeConversion(paying,    onboarded)

  const filteredContactToOnboard = applyFilters(contactToOnboard, { ...filterState, sortBy: sortBy === 'alpha' ? 'alpha' : 'rate' })
    .filter(r => r.rate >= rateFloor)
  const filteredOnboardToPaying  = applyFilters(onboardToPaying,  { ...filterState, sortBy: sortBy === 'alpha' ? 'alpha' : 'rate' })
    .filter(r => r.rate >= rateFloor)

  // Summary counts for header stats — unfiltered so stat cards always show totals
  const funnelStages = funnel ? [
    { name: 'New Contacts',     value: funnel.newContacts,     fill: '#6366f1' },
    { name: 'Onboarded',        value: funnel.onboarded,       fill: '#f97316' },
    { name: 'Lysted Customers', value: funnel.lystedCustomers, fill: '#3b82f6' },
    { name: 'Paying Customers', value: funnel.payingCustomers, fill: '#22c55e' },
  ] : []

  // Helper: display "N of M" hidden-row note under a chart
  const hiddenNote = (filtered, total) => {
    const hidden = total.length - filtered.length
    if (hidden <= 0) return null
    return (
      <span className="filter-hidden-note">
        {hidden} source{hidden !== 1 ? 's' : ''} hidden by filters
      </span>
    )
  }

  return (
    <div className="insights-page">

      {/* ── Controls row 1: time window ──────────────────────────────── */}
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
        {filtersActive && !isFetching && (
          <span className="filters-active-badge">Filters active</span>
        )}
        {filtersActive && (
          <button className="filter-reset" onClick={resetFilters}>Reset filters</button>
        )}
      </div>

      {/* ── Controls row 2: filters ───────────────────────────────────── */}
      <div className="insights-filters">
        <FilterGroup
          label="Min contacts"
          options={MIN_COUNT_OPTIONS}
          value={minCount}
          onChange={setMinCount}
        />
        <div className="filter-divider" />
        <FilterGroup
          label="Show"
          options={TOP_N_OPTIONS}
          value={topN}
          onChange={setTopN}
        />
        <div className="filter-divider" />
        <FilterGroup
          label="Sort"
          options={SORT_OPTIONS}
          value={sortBy}
          onChange={setSortBy}
        />
        <div className="filter-divider" />
        <FilterGroup
          label="Source type"
          options={SOURCE_TYPE_OPTIONS}
          value={sourceTypes}
          onChange={setSourceTypes}
          multi
        />
        <div className="filter-divider" />
        <FilterGroup
          label="Conv. rate ≥"
          options={RATE_FLOOR_OPTIONS}
          value={rateFloor}
          onChange={setRateFloor}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Marketing Attributed New Contacts
      ══════════════════════════════════════════════════════════════════ */}
      <section className="insights-section">
        <h2 className="insights-section-title">
          Section 1 — Marketing Attributed New Contacts (T{days})
        </h2>

        <InsightNote>
          Attribution: <strong>drill-down source</strong> via <code>hs_analytics_source_data_1</code> —
          specific sub-source values (e.g. "google", "facebook.com") rather than broad HubSpot buckets.
          T{days} window applied to <strong>contact create date</strong>.
        </InsightNote>

        <div className="insights-stats">
          <StatCard label={`New Contacts (T${days})`} value={fmt(funnel?.newContacts)} accent="blue" />
          <StatCard label="Top Channel" value={newC[0]?.short ?? '—'} sub={newC[0] ? fmt(newC[0].count) + ' contacts' : ''} />
          <StatCard label="#2 Channel"  value={newC[1]?.short ?? '—'} sub={newC[1] ? fmt(newC[1].count) + ' contacts' : ''} />
          <StatCard label="Sources Found" value={fmt(newC.length)} sub={`${filteredNewC.length} shown`} />
        </div>

        <div className="insights-charts-row">
          <ChartCard title={`New Contacts by Channel (T${days})`} className="chart-tall">
            {l1 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(200, filteredNewC.length * 34)}>
                  <BarChart data={filteredNewC} layout="vertical" margin={{ right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="short" type="category" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip formatter={(v) => [fmt(v), 'New Contacts']} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {filteredNewC.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {hiddenNote(filteredNewC, newC)}
              </>
            )}
          </ChartCard>

          <ChartCard title={`Channel Share — New Contacts (T${days})`}>
            {l1 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : (
              <>
                <div className="channel-table">
                  <div className="channel-table-header">
                    <span>Channel</span>
                    <span>Count</span>
                    <span>Share</span>
                  </div>
                  {filteredNewC.map((r) => {
                    const total = filteredNewC.reduce((s, x) => s + x.count, 0)
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
                {hiddenNote(filteredNewC, newC)}
              </>
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
          "Onboarded" = <code>datateam_lysted_onboard_date__c</code> set (75k+ records, live).
          T{days} window filters on this date. Attribution via <code>hs_analytics_source_data_1</code>.
        </InsightNote>

        <div className="insights-stats">
          <StatCard label={`Onboarded (T${days})`} value={fmt(funnel?.onboarded)} accent="orange" />
          <StatCard
            label="Contact → Onboard Rate"
            value={pct(funnel?.onboarded, funnel?.newContacts)}
            sub={`${fmt(funnel?.onboarded)} of ${fmt(funnel?.newContacts)}`}
          />
          <StatCard label="Top Onboard Channel" value={onb[0]?.short ?? '—'} sub={onb[0] ? fmt(onb[0].count) + ' onboarded' : ''} accent="orange" />
          <StatCard label="Sources Found" value={fmt(onb.length)} sub={`${filteredOnb.length} shown`} />
        </div>

        <div className="insights-charts-row">
          <ChartCard title={`Onboarded by Channel (T${days})`} className="chart-tall">
            {l2 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(200, filteredOnb.length * 34)}>
                  <BarChart data={filteredOnb} layout="vertical" margin={{ right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="short" type="category" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip formatter={(v) => [fmt(v), 'Onboarded']} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {filteredOnb.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {hiddenNote(filteredOnb, onb)}
              </>
            )}
          </ChartCard>

          <ChartCard title={`Contact → Onboard Rate by Channel (T${days})`}>
            {l1 || l2 ? (
              <div className="loading-placeholder">Loading…</div>
            ) : (
              <>
                <div className="channel-table">
                  <div className="channel-table-header">
                    <span>Channel</span>
                    <span>Onboarded</span>
                    <span>Conv. %</span>
                  </div>
                  {filteredContactToOnboard.length === 0 ? (
                    <div className="empty-state">No channels match current filters</div>
                  ) : filteredContactToOnboard.map((r) => (
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
                {hiddenNote(filteredContactToOnboard, contactToOnboard)}
              </>
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
          <strong>Lysted customer</strong> = <code>datateam_username_lysted</code> present.{' '}
          <strong>Paying</strong> = <code>datateam_lifetime_sales_lysted</code> &gt; 0.
          Counts are <em>all-time</em> totals (not windowed) — these are properties, not timestamped events.
          All <code>datateam_*</code> fields are synced from Redshift.
        </InsightNote>

        <div className="insights-stats">
          <StatCard label="Lysted Customers (All Time)" value={fmt(funnel?.lystedCustomers)} sub="datateam_username_lysted present" accent="blue" />
          <StatCard label="Paying Customers (All Time)" value={fmt(funnel?.payingCustomers)} sub="lifetime_sales_lysted > 0" accent="green" />
          <StatCard label="Has Sold a Ticket" value={fmt(funnel?.hasSoldTicket)} sub="has_sold_ticket_lysted = true" />
          <StatCard label="Signed Up" value={fmt(funnel?.hasSignup)} sub="has_lysted_signup = true" />
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
                      {convRate && <div className="funnel-arrow">↓ {convRate} conversion</div>}
                      <div className="funnel-bar" style={{ width: `${widthPct}%`, background: stage.fill }}>
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
            ) : (
              <>
                {filteredPay.length === 0 ? (
                  <div className="empty-state">No channels match current filters</div>
                ) : (
                  <div className="channel-table">
                    <div className="channel-table-header">
                      <span>Channel</span>
                      <span>Paying</span>
                      <span>Conv. %</span>
                    </div>
                    {filteredOnboardToPaying.map((r) => (
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
                    {filteredPay
                      .filter(r => !filteredOnboardToPaying.find(x => x.source === r.source))
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
                )}
                {hiddenNote(filteredPay, pay)}
              </>
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
                <Line type="monotone" dataKey="newContacts" name="New Contacts" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="onboarded"   name="Onboarded"    stroke="#f97316" strokeWidth={2} dot={false} />
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
              q: 'Paying customer source attribution accuracy',
              status: 'warning',
              note: 'datateam_lifetime_sales_lysted > 0 identifies paying customers, but hs_analytics_source_data_1 may not reflect their acquisition channel if it was set before the paid conversion. Cross-reference with Redshift for full attribution.',
            },
            {
              q: 'Session → listing conversion rate',
              status: 'gap',
              note: 'Not available in HubSpot. Requires product event data (Pendo or custom analytics) tracking "sessions by new registrant with no listings who then lists".',
            },
            {
              q: 'True marketplace sell-through rate',
              status: 'gap',
              note: 'Not in HubSpot. Requires transactional data from the marketplace backend. has_sold_ticket_lysted is the closest proxy.',
            },
            {
              q: 'has_lysted_onboarding vs datateam_lysted_onboard_date__c difference',
              status: 'unclear',
              note: 'Both signal onboarding completion but may differ if the boolean is set before Redshift syncs the date. The datateam_* date field (75k records) should be canonical.',
            },
            {
              q: 'T-window for paying customers',
              status: 'answered',
              note: 'Section 3 paying counts are all-time because datateam_lifetime_sales_lysted is a property, not a timestamped event. The T-window applies to new contacts and onboards only.',
            },
            {
              q: 'Source attribution field',
              status: 'answered',
              note: 'hs_analytics_source_data_1 is used per data team guidance. It provides specific sub-sources (e.g. "google", "facebook.com") rather than broad HubSpot source buckets.',
            },
          ].map((item) => (
            <div key={item.q} className={`gap-card gap-card--${item.status}`}>
              <div className="gap-card-header">
                <span className={`gap-badge gap-badge--${item.status}`}>
                  {item.status === 'gap' ? '🔴 Gap'
                    : item.status === 'warning' ? '🟡 Warning'
                    : item.status === 'unclear' ? '🟠 Unclear'
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
