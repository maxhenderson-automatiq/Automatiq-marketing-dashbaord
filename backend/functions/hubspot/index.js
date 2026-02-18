/**
 * HubSpot proxy Lambda
 * Credentials: HUBSPOT_ACCESS_TOKEN env var (set via SAM parameter)
 */

const BASE = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

// Simple in-memory cache to avoid hammering HubSpot on every request
const cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function hubspotGet(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HubSpot ${res.status}: ${body}`)
  }
  return res.json()
}

function cached(key, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return Promise.resolve(hit.data)
  return fn().then((data) => {
    cache.set(key, { data, ts: Date.now() })
    return data
  })
}

// ─── Route handlers ────────────────────────────────────────────────────────

async function getContacts() {
  // Total count via search endpoint (efficient — no full scan)
  const [all, thisMonth] = await Promise.all([
    hubspotGet('/crm/v3/objects/contacts', { limit: 1 }),
    hubspotGet('/crm/v3/objects/contacts/search', {}).then(() => null), // placeholder
  ])

  // Lifecycle stage breakdown via associations/properties search
  // TODO: replace with real aggregation once you confirm property names in your portal
  const lifecycleStages = [
    'subscriber', 'lead', 'marketingqualifiedlead',
    'salesqualifiedlead', 'opportunity', 'customer',
  ]

  return {
    total: all.total ?? 0,
    newThisMonth: 0, // TODO: filter createdate >= first of month
    byLifecycle: lifecycleStages.map((stage) => ({ stage, count: 0 })),
    _note: 'Lifecycle counts require per-stage search calls — implement as needed',
  }
}

async function getContactTrend() {
  // TODO: HubSpot doesn't expose a native time-series contacts endpoint.
  // Best approach: query contacts created each month using date filters.
  // For now returns empty array — wire up once portal access is confirmed.
  return []
}

async function getDeals() {
  const data = await hubspotGet('/crm/v3/objects/deals', {
    limit: 100,
    properties: 'dealstage,amount,pipeline',
  })

  // Group by stage
  const byStage = {}
  for (const deal of data.results ?? []) {
    const stage = deal.properties?.dealstage ?? 'unknown'
    if (!byStage[stage]) byStage[stage] = { stage, count: 0, amount: 0 }
    byStage[stage].count++
    byStage[stage].amount += parseFloat(deal.properties?.amount ?? 0)
  }

  return Object.values(byStage)
}

// ─── Router ────────────────────────────────────────────────────────────────

const ROUTES = {
  'GET /hubspot/contacts':       () => cached('contacts', getContacts),
  'GET /hubspot/contacts/trend': () => cached('contacts-trend', getContactTrend),
  'GET /hubspot/deals':          () => cached('deals', getDeals),
}

export const handler = async (event) => {
  const routeKey = `${event.httpMethod} ${event.path}`

  try {
    if (!TOKEN) throw new Error('HUBSPOT_ACCESS_TOKEN is not set')

    const fn = ROUTES[routeKey]
    if (!fn) return respond(404, { error: `Unknown route: ${routeKey}` })

    const data = await fn()()
    return respond(200, data)
  } catch (err) {
    console.error('HubSpot Lambda error:', err)
    return respond(500, { error: err.message })
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN ?? '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  }
}
