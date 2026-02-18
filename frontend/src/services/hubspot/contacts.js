/**
 * HubSpot contacts service
 *
 * Local dev:  uses Vite proxy at /proxy/hubspot → api.hubapi.com
 * Production: calls /hubspot/* on the Lambda API Gateway proxy
 *
 * Rate limiting: HubSpot allows ~10 req/sec on private app tokens.
 * We serialize calls that would otherwise burst in parallel.
 */
import { apiGet, proxyPost, isLocalDev } from '../client'

/** Serialize an array of async fns with a ms delay between each */
async function sequential(fns, delayMs = 120) {
  const results = []
  for (const fn of fns) {
    results.push(await fn())
    if (delayMs > 0 && fns.indexOf(fn) < fns.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return results
}

// ─── Local dev (real API) ─────────────────────────────────────────────────

async function fetchContactSummaryDirect() {
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  firstOfMonth.setHours(0, 0, 0, 0)

  // Total + new this month — sequential to avoid rate limit burst
  const [totalRes, newThisMonthRes] = await sequential([
    () => proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', {
      filterGroups: [],
      limit: 1,
      properties: ['lifecyclestage'],
    }),
    () => proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', {
      filterGroups: [{
        filters: [{
          propertyName: 'createdate',
          operator: 'GTE',
          value: String(firstOfMonth.getTime()),
        }],
      }],
      limit: 1,
    }),
  ])

  // Lifecycle breakdown — serialized (6 calls)
  const stages = [
    { label: 'Subscriber',  value: 'subscriber' },
    { label: 'Lead',        value: 'lead' },
    { label: 'MQL',         value: 'marketingqualifiedlead' },
    { label: 'SQL',         value: 'salesqualifiedlead' },
    { label: 'Opportunity', value: 'opportunity' },
    { label: 'Customer',    value: 'customer' },
  ]

  const stageCounts = await sequential(
    stages.map(({ label, value }) => async () => {
      const res = await proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value }],
        }],
        limit: 1,
        properties: ['lifecyclestage'],
      })
      return { stage: label, count: res.total ?? 0 }
    })
  )

  return {
    total: totalRes.total ?? 0,
    newThisMonth: newThisMonthRes.total ?? 0,
    byLifecycle: stageCounts,
  }
}

async function fetchContactTrendDirect() {
  // 12 monthly buckets — serialized to stay under rate limit
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (11 - i))
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const counts = await sequential(
    months.map((start, i) => async () => {
      const end = i < 11 ? months[i + 1] : new Date()
      const res = await proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [
            { propertyName: 'createdate', operator: 'GTE', value: String(start.getTime()) },
            { propertyName: 'createdate', operator: 'LT',  value: String(end.getTime()) },
          ],
        }],
        limit: 1,
      })
      return {
        month: start.toLocaleString('default', { month: 'short', year: '2-digit' }),
        contacts: res.total ?? 0,
      }
    })
  )

  return counts
}

// ─── Exports ──────────────────────────────────────────────────────────────

export async function getContactSummary() {
  if (isLocalDev()) return fetchContactSummaryDirect()
  return apiGet('/hubspot/contacts')
}

export async function getContactTrend() {
  if (isLocalDev()) return fetchContactTrendDirect()
  return apiGet('/hubspot/contacts/trend')
}
