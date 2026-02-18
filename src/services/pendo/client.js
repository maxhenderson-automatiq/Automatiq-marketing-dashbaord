/**
 * Pendo Aggregation API client
 *
 * NOTE: Pendo's Aggregation API requires server-side auth.
 * For local dev we use mock data. For production use a Lambda
 * proxy that signs requests with your Integration Key.
 *
 * Docs: https://engageapi.pendo.io/
 */

const BASE_URL = 'https://app.pendo.io/api/v1'
const API_KEY = import.meta.env.VITE_PENDO_API_KEY

export async function pendoPost(path, body = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'x-pendo-integration-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Pendo API error ${res.status}`)
  }

  return res.json()
}
