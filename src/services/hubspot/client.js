/**
 * HubSpot API client
 *
 * NOTE: HubSpot's API does not support browser CORS by default.
 * For local dev we use mock data. For production you'll need a
 * thin proxy (Lambda + API Gateway, or Cloudflare Worker) that
 * holds the private access token server-side and forwards requests.
 *
 * Docs: https://developers.hubspot.com/docs/api/overview
 */

const BASE_URL = 'https://api.hubapi.com'
const TOKEN = import.meta.env.VITE_HUBSPOT_ACCESS_TOKEN

export async function hubspotGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `HubSpot API error ${res.status}`)
  }

  return res.json()
}
