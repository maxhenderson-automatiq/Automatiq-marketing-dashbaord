/**
 * GA4 proxy Lambda
 * Credentials: GA4_PROPERTY_ID + GA4_API_SECRET env vars (set via SAM parameter)
 *
 * Uses the GA4 Data API (runReport)
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1
 *
 * NOTE: This implementation uses the Measurement Protocol API secret for simple
 * queries. For full Data API access you'll need a service account — swap the
 * fetch call below with the @google-analytics/data SDK and add it to package.json.
 */

const PROPERTY_ID = process.env.GA4_PROPERTY_ID
const API_SECRET = process.env.GA4_API_SECRET

const cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

async function ga4Report(body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport?key=${API_SECRET}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GA4 ${res.status}: ${text}`)
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

async function getSessions() {
  const data = await ga4Report({
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  })

  return (data.rows ?? []).map((row) => ({
    date: row.dimensionValues?.[0]?.value,
    sessions: parseInt(row.metricValues?.[0]?.value ?? 0, 10),
    users: parseInt(row.metricValues?.[1]?.value ?? 0, 10),
  }))
}

async function getTopPages() {
  const data = await ga4Report({
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 10,
  })

  return (data.rows ?? []).map((row) => ({
    page: row.dimensionValues?.[0]?.value,
    views: parseInt(row.metricValues?.[0]?.value ?? 0, 10),
    avgDuration: parseFloat(row.metricValues?.[1]?.value ?? 0).toFixed(1),
  }))
}

// ─── Router ────────────────────────────────────────────────────────────────

const ROUTES = {
  'GET /ga4/sessions':  () => cached('ga4-sessions', getSessions),
  'GET /ga4/top-pages': () => cached('ga4-top-pages', getTopPages),
}

export const handler = async (event) => {
  const routeKey = `${event.httpMethod} ${event.path}`

  try {
    if (!PROPERTY_ID || !API_SECRET) {
      throw new Error('GA4_PROPERTY_ID or GA4_API_SECRET is not set')
    }

    const fn = ROUTES[routeKey]
    if (!fn) return respond(404, { error: `Unknown route: ${routeKey}` })

    const data = await fn()()
    return respond(200, data)
  } catch (err) {
    console.error('GA4 Lambda error:', err)
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
