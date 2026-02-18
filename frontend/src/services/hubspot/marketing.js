/**
 * HubSpot marketing attribution service
 *
 * Answers the three-section funnel:
 *   Section 1: New Contacts (leads) by channel  — hs_analytics_source_data_1 + createdate
 *   Section 2: Onboarded by channel             — datateam_lysted_onboard_date__c
 *   Section 3: Lysted / Paying customers        — datateam_username_lysted + datateam_lifetime_sales_lysted
 *
 * "Lysted customer"  = datateam_username_lysted is present
 * "Paying customer"  = datateam_lifetime_sales_lysted > 0
 * Boolean signals    = has_sold_ticket_lysted, has_lysted_signup, has_lysted_onboarding
 *
 * Attribution model: hs_analytics_source_data_1 (drill-down 1) — best true-channel indicator.
 * All datateam_* fields are synced from Redshift and are authoritative.
 */
import { apiGet, proxyPost, isLocalDev } from '../client'

// ─── Source metadata ──────────────────────────────────────────────────────────
// hs_analytics_source_data_1 values are free-text drill-down strings.
// We normalise the most common values here; anything unknown falls back to label=value.
export const SOURCE_META = {
  // Paid search networks
  'google':            { label: 'Google (Paid)',    short: 'Google Ads',   color: '#6366f1' },
  'bing':              { label: 'Bing (Paid)',       short: 'Bing Ads',     color: '#818cf8' },
  'facebook':          { label: 'Facebook (Paid)',   short: 'FB Ads',       color: '#3b82f6' },
  'instagram':         { label: 'Instagram (Paid)',  short: 'IG Ads',       color: '#a855f7' },

  // Organic / referral
  'google.com':        { label: 'Google (Organic)',  short: 'Google Org',   color: '#22c55e' },
  'bing.com':          { label: 'Bing (Organic)',    short: 'Bing Org',     color: '#86efac' },
  'facebook.com':      { label: 'Facebook (Organic)',short: 'FB Organic',   color: '#93c5fd' },
  'instagram.com':     { label: 'Instagram (Org)',   short: 'IG Organic',   color: '#c4b5fd' },
  'direct':            { label: 'Direct',            short: 'Direct',       color: '#94a3b8' },
  'email':             { label: 'Email',             short: 'Email',        color: '#f59e0b' },
  'offline':           { label: 'Offline / Import',  short: 'Offline',      color: '#475569' },

  // Fallback buckets (matched by prefix in enrichSource)
  '__ORGANIC_SEARCH':  { label: 'Organic Search',   short: 'Organic',      color: '#22c55e' },
  '__PAID_SEARCH':     { label: 'Paid Search',       short: 'Paid SEM',     color: '#6366f1' },
  '__PAID_SOCIAL':     { label: 'Paid Social',       short: 'Paid Social',  color: '#a855f7' },
  '__SOCIAL_MEDIA':    { label: 'Organic Social',    short: 'Social',       color: '#3b82f6' },
  '__EMAIL_MARKETING': { label: 'Email',             short: 'Email',        color: '#f59e0b' },
  '__REFERRALS':       { label: 'Referrals',         short: 'Referral',     color: '#14b8a6' },
  '__OFFLINE':         { label: 'Offline / Import',  short: 'Offline',      color: '#475569' },
  '__DIRECT_TRAFFIC':  { label: 'Direct',            short: 'Direct',       color: '#94a3b8' },
  '__OTHER_CAMPAIGNS': { label: 'Other Campaigns',   short: 'Other',        color: '#f97316' },
  '__AI_REFERRALS':    { label: 'AI Referrals',      short: 'AI',           color: '#ec4899' },
  '__OTHER':           { label: 'Other / Unknown',   short: 'Other',        color: '#64748b' },
}

/** Enrich a raw source string → { label, short, color } */
export function enrichSource(src) {
  if (!src) return { label: 'Unknown', short: 'Unknown', color: '#64748b' }
  const lower = src.toLowerCase().trim()
  if (SOURCE_META[lower]) return SOURCE_META[lower]
  // Normalise well-known substrings
  if (lower.includes('google'))    return SOURCE_META['google.com']
  if (lower.includes('facebook'))  return SOURCE_META['facebook.com']
  if (lower.includes('instagram')) return SOURCE_META['instagram.com']
  if (lower.includes('bing'))      return SOURCE_META['bing.com']
  if (lower.includes('email'))     return SOURCE_META['email']
  if (lower.includes('direct'))    return SOURCE_META['direct']
  if (lower.includes('offline'))   return SOURCE_META['offline']
  return { label: src, short: src.slice(0, 14), color: '#64748b' }
}

/** Serialize async fns with delay to avoid HubSpot 429 (10 req/s limit) */
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

/**
 * Fetch contacts with a date filter, grouped by hs_analytics_source_data_1.
 * Pages through results (up to 10k) to build frequency counts.
 * Returns [{ source, count }] sorted descending.
 */
async function countBySourceData1(dateFilter, maxPages = 20) {
  const counts = {}
  let after = undefined
  let pages = 0

  while (pages < maxPages) {
    const body = {
      filterGroups: [{ filters: [dateFilter] }],
      limit: 100,
      properties: ['hs_analytics_source_data_1'],
      ...(after ? { after } : {}),
    }
    const res = await proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', body)
    const results = res.results ?? []

    for (const contact of results) {
      const raw = contact.properties?.hs_analytics_source_data_1
      const src = (raw ?? '').toLowerCase().trim() || '__OTHER'
      counts[src] = (counts[src] ?? 0) + 1
    }

    const nextPage = res.paging?.next?.after
    if (!nextPage || results.length < 100) break
    after = nextPage
    pages++
    await new Promise(r => setTimeout(r, 130))
  }

  return Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
}

// ─── Section 1: New contacts by source_data_1 ────────────────────────────────

async function fetchNewContactsBySourceDirect(days = 30) {
  const since = tsMs(days)
  return countBySourceData1({
    propertyName: 'createdate',
    operator: 'GTE',
    value: String(since),
  })
}

// ─── Section 2: Onboarded (Lysted signup) by source_data_1 ───────────────────
// "Onboarded" = datateam_lysted_onboard_date__c is set (75k+ records, live)

async function fetchOnboardedBySourceDirect(days = 30) {
  const since = tsMs(days)
  return countBySourceData1({
    propertyName: 'datateam_lysted_onboard_date__c',
    operator: 'GTE',
    value: String(since),
  })
}

// ─── Section 3: Lysted customers (paying) by source_data_1 ───────────────────
// "Lysted customer"  = datateam_username_lysted is present
// "Paying customer"  = datateam_lifetime_sales_lysted > 0

async function fetchLystedBySourceDirect(days = 30) {
  const since = tsMs(days)
  return countBySourceData1({
    propertyName: 'datateam_lysted_onboard_date__c',
    operator: 'GTE',
    value: String(since),
  })
}

async function fetchPayingBySourceDirect(days = 30) {
  // Filter: datateam_username_lysted present AND datateam_lifetime_sales_lysted > 0
  // We page through contacts matching these filters and group by source_data_1
  const counts = {}
  let after = undefined
  let pages = 0

  while (pages < 20) {
    const body = {
      filterGroups: [{
        filters: [
          { propertyName: 'datateam_username_lysted', operator: 'HAS_PROPERTY' },
          { propertyName: 'datateam_lifetime_sales_lysted', operator: 'GT', value: '0' },
        ],
      }],
      limit: 100,
      properties: ['hs_analytics_source_data_1'],
      ...(after ? { after } : {}),
    }
    const res = await proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', body)
    const results = res.results ?? []

    for (const contact of results) {
      const raw = contact.properties?.hs_analytics_source_data_1
      const src = (raw ?? '').toLowerCase().trim() || '__OTHER'
      counts[src] = (counts[src] ?? 0) + 1
    }

    const nextPage = res.paging?.next?.after
    if (!nextPage || results.length < 100) break
    after = nextPage
    pages++
    await new Promise(r => setTimeout(r, 130))
  }

  return Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
}

// ─── Funnel totals (for conversion rate stats) ────────────────────────────────

async function fetchFunnelTotalsDirect(days = 30) {
  const since = tsMs(days)
  const sinceStr = String(since)

  const [newContacts, onboarded, lystedCustomers, payingCustomers, hasSoldTicket, hasSignup] =
    await sequential([
      // New contacts created in window
      () => countContacts([
        { propertyName: 'createdate', operator: 'GTE', value: sinceStr },
      ]),
      // Onboarded (lysted_onboard_date in window)
      () => countContacts([
        { propertyName: 'datateam_lysted_onboard_date__c', operator: 'GTE', value: sinceStr },
      ]),
      // Lysted customers (username present) — all time, not windowed
      () => countContacts([
        { propertyName: 'datateam_username_lysted', operator: 'HAS_PROPERTY' },
      ]),
      // Paying customers (username present + lifetime_sales > 0) — all time
      () => countContacts([
        { propertyName: 'datateam_username_lysted', operator: 'HAS_PROPERTY' },
        { propertyName: 'datateam_lifetime_sales_lysted', operator: 'GT', value: '0' },
      ]),
      // has_sold_ticket_lysted = true
      () => countContacts([
        { propertyName: 'has_sold_ticket_lysted', operator: 'EQ', value: 'true' },
      ]),
      // has_lysted_signup = true
      () => countContacts([
        { propertyName: 'has_lysted_signup', operator: 'EQ', value: 'true' },
      ]),
    ])

  return { newContacts, onboarded, lystedCustomers, payingCustomers, hasSoldTicket, hasSignup }
}

// ─── Monthly trend by stage ───────────────────────────────────────────────────

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

      const [newC, onboarded] = await sequential([
        () => countContacts([
          { propertyName: 'createdate', operator: 'GTE', value: startStr },
          { propertyName: 'createdate', operator: 'LT', value: endStr },
        ]),
        () => countContacts([
          { propertyName: 'datateam_lysted_onboard_date__c', operator: 'GTE', value: startStr },
          { propertyName: 'datateam_lysted_onboard_date__c', operator: 'LT', value: endStr },
        ]),
      ], 130)

      return { month: label, newContacts: newC, onboarded }
    }),
    250  // slightly longer gap between months
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
