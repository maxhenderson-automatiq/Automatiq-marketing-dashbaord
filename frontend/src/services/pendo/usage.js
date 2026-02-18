/**
 * Pendo usage service
 *
 * Local dev:  uses Vite proxy at /proxy/pendo → app.pendo.io
 *             (integration key injected by Vite Node process — never in bundle)
 * Production: calls /pendo/* on the Lambda API Gateway proxy
 */
import { apiGet, proxyGet, proxyPost, isLocalDev } from '../client'

const nowMs = () => Date.now()
const daysAgo = (n) => nowMs() - n * 24 * 60 * 60 * 1000

// ─── Local dev (real API) ─────────────────────────────────────────────────

async function fetchDauDirect() {
  // Pull raw visitor-day rows for last 30 days and aggregate client-side.
  // Pendo's aggregation API grouping syntax is strict — raw + client group is
  // more reliable across API versions.
  const res = await proxyPost('/proxy/pendo/api/v1/aggregation', {
    response: { mimeType: 'application/json' },
    request: {
      pipeline: [
        {
          source: {
            timeSeries: {
              first: daysAgo(30),
              last: nowMs(),
              period: 'dayRange',
            },
            events: null,
          },
        },
        { limit: 5000 }, // enough for 30d of visitor rows
      ],
    },
  })

  // Group by day, count distinct visitors
  const byDay = {}
  for (const row of res.results ?? []) {
    const dayKey = row.day
    if (!byDay[dayKey]) byDay[dayKey] = new Set()
    if (row.visitorId) byDay[dayKey].add(row.visitorId)
  }

  return Object.entries(byDay)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([dayTs, visitors]) => ({
      date: new Date(Number(dayTs)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      dau: visitors.size,
    }))
}

async function fetchTopFeaturesDirect() {
  // Fetch raw page events for last 30 days
  const [eventsRes, pagesRes] = await Promise.all([
    proxyPost('/proxy/pendo/api/v1/aggregation', {
      response: { mimeType: 'application/json' },
      request: {
        pipeline: [
          {
            source: {
              timeSeries: {
                first: daysAgo(30),
                last: nowMs(),
                period: 'dayRange',
              },
              events: null,
            },
          },
          { limit: 10000 },
        ],
      },
    }),
    proxyGet('/proxy/pendo/api/v1/page?limit=500').catch(() => []),
  ])

  // Build pageId → name map
  const pages = Array.isArray(pagesRes) ? pagesRes : (pagesRes.results ?? [])
  const nameMap = {}
  for (const p of pages) {
    nameMap[p.id] = p.name ?? p.id
  }

  // Aggregate numEvents by pageId
  const byPage = {}
  for (const row of eventsRes.results ?? []) {
    const pid = row.pageId
    if (!pid || pid === 'allevents') continue
    byPage[pid] = (byPage[pid] ?? 0) + (row.numEvents ?? 1)
  }

  return Object.entries(byPage)
    .map(([pid, views]) => ({ feature: nameMap[pid] ?? pid, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
}

// ─── Exports ─────────────────────────────────────────────────────────────

export async function getDailyActiveUsers() {
  if (isLocalDev()) return fetchDauDirect()
  return apiGet('/pendo/dau')
}

export async function getTopFeatures() {
  if (isLocalDev()) return fetchTopFeaturesDirect()
  return apiGet('/pendo/features')
}
