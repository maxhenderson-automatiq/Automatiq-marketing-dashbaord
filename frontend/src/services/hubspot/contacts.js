/**
 * HubSpot contacts service
 *
 * Local dev:  uses Vite proxy at /proxy/hubspot → api.hubapi.com
 * Production: calls /hubspot/* on the Lambda API Gateway proxy
 */
import { apiGet, proxyGet, proxyPost, isLocalDev } from '../client'

// ─── Local dev (real API) ─────────────────────────────────────────────────

async function fetchContactSummaryDirect() {
  // Use search endpoint (supports total count) with limit:0 for efficiency
  const [totalRes, newThisMonthRes] = await Promise.all([
    proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', {
      filterGroups: [],
      limit: 1,
      properties: ['lifecyclestage'],
    }),
    (() => {
      const firstOfMonth = new Date()
      firstOfMonth.setDate(1)
      firstOfMonth.setHours(0, 0, 0, 0)
      return proxyPost('/proxy/hubspot/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'createdate',
            operator: 'GTE',
            value: String(firstOfMonth.getTime()),
          }],
        }],
        limit: 1,
      })
    })(),
  ])

  // Lifecycle breakdown — parallel search per stage
  const stages = [
    { label: 'Subscriber',  value: 'subscriber' },
    { label: 'Lead',        value: 'lead' },
    { label: 'MQL',         value: 'marketingqualifiedlead' },
    { label: 'SQL',         value: 'salesqualifiedlead' },
    { label: 'Opportunity', value: 'opportunity' },
    { label: 'Customer',    value: 'customer' },
  ]

  const stageCounts = await Promise.all(
    stages.map(async ({ label, value }) => {
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
  // Monthly new contact counts for last 12 months
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (11 - i))
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const counts = await Promise.all(
    months.map(async (start, i) => {
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
