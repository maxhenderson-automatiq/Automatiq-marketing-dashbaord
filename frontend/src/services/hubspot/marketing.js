/**
 * HubSpot marketing attribution service
 *
 * Answers the three-section funnel:
 *   Section 1: New Contacts (leads) by channel  — hs_analytics_source + createdate
 *   Section 2: Onboarded by channel             — datateam_lysted_onboard_date__c
 *   Section 3: Paying customers by channel      — datateam_dataiq_conversion_paid_date
 *
 * All metrics are T30 (trailing 30 days) by default.
 * Attribution model: Original source (hs_analytics_source) — first touch.
 */
import { apiGet, proxyPost, isLocalDev } from '../client'

// HubSpot source enum → human label + short label for charts
export const SOURCE_META = {
  ORGANIC_SEARCH:   { label: 'Organic Search',   short: 'Organic',  color: '#22c55e' },
  PAID_SEARCH:      { label: 'Paid Search',       short: 'Paid SEM', color: '#6366f1' },
  PAID_SOCIAL:      { label: 'Paid Social',       short: 'Paid Social', color: '#a855f7' },
  SOCIAL_MEDIA:     { label: 'Organic Social',    short: 'Organic Social', color: '#3b82f6' },
  EMAIL_MARKETING:  { label: 'Email',             short: 'Email',    color: '#f59e0b' },
  REFERRALS:        { label: 'Referrals',         short: 'Referral', color: '#14b8a6' },
  OTHER_CAMPAIGNS:  { label: 'Other Campaigns',   short: 'Other Campaigns', color: '#f97316' },
  DIRECT_TRAFFIC:   { label: 'Direct',            short: 'Direct',   color: '#94a3b8' },
  OFFLINE:          { label: 'Offline / Import',  short: 'Offline',  color: '#475569' },
  AI_REFERRALS:     { label: 'AI Referrals',      short: 'AI',       color: '#ec4899' },
}

const ALL_SOURCES = Object.keys(SOURCE_META)

/** Serialize async fns with delay to avoid HubSpot 429 */
async function sequential(fns, delayMs = 130) {
  const results = []
  for (let i = 0; i < fns.length; i++) {
    results.push(await fns[i]())
    if (i < fns.length - 1) await new Promise(r => setTimeout(r, delayMs))
  }
  return results
}

function tsMs(daysAgo = 0) {
  return Date.now() - daysAgo * 24 * 60 * 60 * 1000
}

/** Single HubSpot search returning just the total count */
async function countContacts(filters) {
  const res = await proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters }],
    limit: 1,
    properties: [],
  })
  return res.total ?? 0
}

// ─── Section 1: New contacts by source ─────────────────────────────────────

async function fetchNewContactsBySourceDirect(days = 30) {
  const since = tsMs(days)
  const rows = await sequential(
    ALL_SOURCES.map(src => () =>
      countContacts([
        { propertyName: 'createdate', operator: 'GTE', value: String(since) },
        { propertyName: 'hs_analytics_source', operator: 'EQ', value: src },
      ]).then(count => ({ source: src, count }))
    )
  )
  return rows.filter(r => r.count > 0).sort((a, b) => b.count - a.count)
}

// ─── Section 2: Onboarded by source ─────────────────────────────────────────
// Uses datateam_lysted_onboard_date__c — the live/current field (75k+ records)

async function fetchOnboardedBySourceDirect(days = 30) {
  const since = tsMs(days)
  const rows = await sequential(
    ALL_SOURCES.map(src => () =>
      countContacts([
        { propertyName: 'datateam_lysted_onboard_date__c', operator: 'GTE', value: String(since) },
        { propertyName: 'hs_analytics_source', operator: 'EQ', value: src },
      ]).then(count => ({ source: src, count }))
    )
  )
  return rows.filter(r => r.count > 0).sort((a, b) => b.count - a.count)
}

// ─── Section 3: Paying customers by source ───────────────────────────────────

async function fetchPayingBySourceDirect(days = 30) {
  const since = tsMs(days)
  const rows = await sequential(
    ALL_SOURCES.map(src => () =>
      countContacts([
        { propertyName: 'datateam_dataiq_conversion_paid_date', operator: 'GTE', value: String(since) },
        { propertyName: 'hs_analytics_source', operator: 'EQ', value: src },
      ]).then(count => ({ source: src, count }))
    )
  )
  return rows.filter(r => r.count > 0).sort((a, b) => b.count - a.count)
}

// ─── Funnel totals (for conversion rates) ────────────────────────────────────

async function fetchFunnelTotalsDirect(days = 30) {
  const since = tsMs(days)
  const [newContacts, onboarded, paying] = await sequential([
    () => countContacts([{ propertyName: 'createdate', operator: 'GTE', value: String(since) }]),
    () => countContacts([{ propertyName: 'datateam_lysted_onboard_date__c', operator: 'GTE', value: String(since) }]),
    () => countContacts([{ propertyName: 'datateam_dataiq_conversion_paid_date', operator: 'GTE', value: String(since) }]),
  ])
  return { newContacts, onboarded, paying }
}

// ─── Monthly trend by stage (sparklines) ─────────────────────────────────────

async function fetchMonthlyFunnelTrendDirect() {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    d.setDate(1); d.setHours(0, 0, 0, 0)
    return d
  })

  const rows = await sequential(
    months.map((start, i) => async () => {
      const end = i < 5 ? months[i + 1] : new Date()
      const startStr = String(start.getTime())
      const endStr = String(end.getTime())
      const label = start.toLocaleString('default', { month: 'short', year: '2-digit' })

      const [newC, onboarded, paying] = await sequential([
        () => countContacts([
          { propertyName: 'createdate', operator: 'GTE', value: startStr },
          { propertyName: 'createdate', operator: 'LT', value: endStr },
        ]),
        () => countContacts([
          { propertyName: 'datateam_lysted_onboard_date__c', operator: 'GTE', value: startStr },
          { propertyName: 'datateam_lysted_onboard_date__c', operator: 'LT', value: endStr },
        ]),
        () => countContacts([
          { propertyName: 'datateam_dataiq_conversion_paid_date', operator: 'GTE', value: startStr },
          { propertyName: 'datateam_dataiq_conversion_paid_date', operator: 'LT', value: endStr },
        ]),
      ], 130)

      return { month: label, newContacts: newC, onboarded, paying }
    }),
    200  // slightly longer gap between months (each month = 3 calls inside)
  )

  return rows
}

// ─── Public exports ───────────────────────────────────────────────────────────

export async function getNewContactsBySource(days = 30) {
  if (isLocalDev()) return fetchNewContactsBySourceDirect(days)
  return apiGet(`/hubspot/marketing/new-contacts?days=${days}`)
}

export async function getOnboardedBySource(days = 30) {
  if (isLocalDev()) return fetchOnboardedBySourceDirect(days)
  return apiGet(`/hubspot/marketing/onboarded?days=${days}`)
}

export async function getPayingBySource(days = 30) {
  if (isLocalDev()) return fetchPayingBySourceDirect(days)
  return apiGet(`/hubspot/marketing/paying?days=${days}`)
}

export async function getFunnelTotals(days = 30) {
  if (isLocalDev()) return fetchFunnelTotalsDirect(days)
  return apiGet(`/hubspot/marketing/funnel?days=${days}`)
}

export async function getMonthlyFunnelTrend() {
  if (isLocalDev()) return fetchMonthlyFunnelTrendDirect()
  return apiGet('/hubspot/marketing/trend')
}
