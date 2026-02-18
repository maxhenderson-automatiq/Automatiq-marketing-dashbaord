/**
 * Pendo proxy Lambda
 * Credentials: PENDO_API_KEY env var (set via SAM parameter)
 *
 * Uses the Pendo Aggregation API v1
 * Docs: https://engageapi.pendo.io/
 */

const BASE = 'https://app.pendo.io/api/v1'
const API_KEY = process.env.PENDO_API_KEY

const cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

async function pendoPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'x-pendo-integration-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Pendo ${res.status}: ${text}`)
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

async function getDau() {
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  // Pendo Aggregation API — daily visitor count
  const data = await pendoPost('/aggregation', {
    response: {
      mimeType: 'application/json',
    },
    request: {
      pipeline: [
        {
          source: {
            visitors: {
              identified: true,
            },
          },
        },
        {
          group: {
            group: [{ field: 'auto|dayRange', period: 'dayRange' }],
            fields: [{ count: 'visitorId' }],
          },
        },
        {
          filter: `dayRange >= ${thirtyDaysAgo}`,
        },
        {
          sort: ['dayRange'],
        },
      ],
    },
  })

  return (data.results ?? []).map((row) => ({
    date: new Date(row.dayRange).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    dau: row['count(visitorId)'] ?? 0,
  }))
}

async function getTopFeatures() {
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  const data = await pendoPost('/aggregation', {
    response: { mimeType: 'application/json' },
    request: {
      pipeline: [
        {
          source: {
            events: {
              type: 'page',
              timeSeries: {
                first: thirtyDaysAgo,
                last: now,
                period: 'dayRange',
              },
            },
          },
        },
        {
          group: {
            group: [{ field: 'pageId' }],
            fields: [{ sum: 'numEvents' }],
          },
        },
        { sort: [{ field: 'sum(numEvents)', order: 'desc' }] },
        { limit: { limit: 10 } },
      ],
    },
  })

  return (data.results ?? []).map((row) => ({
    feature: row.pageId ?? 'Unknown',
    views: row['sum(numEvents)'] ?? 0,
  }))
}

// ─── Router ────────────────────────────────────────────────────────────────

const ROUTES = {
  'GET /pendo/dau':      () => cached('pendo-dau', getDau),
  'GET /pendo/features': () => cached('pendo-features', getTopFeatures),
}

export const handler = async (event) => {
  const routeKey = `${event.httpMethod} ${event.path}`

  try {
    if (!API_KEY) throw new Error('PENDO_API_KEY is not set')

    const fn = ROUTES[routeKey]
    if (!fn) return respond(404, { error: `Unknown route: ${routeKey}` })

    const data = await fn()()
    return respond(200, data)
  } catch (err) {
    console.error('Pendo Lambda error:', err)
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
