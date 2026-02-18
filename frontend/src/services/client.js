/**
 * Shared API client
 *
 * Two modes:
 *  - Local dev (isLocalDev): calls Vite proxy routes (/proxy/hubspot, /proxy/pendo)
 *    Vite injects credentials server-side from .env.local — token never touches bundle.
 *  - Production: calls Lambda API Gateway proxy via VITE_API_BASE_URL
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/** True when running under `vite dev` with real tokens available */
export function isLocalDev() {
  return (
    import.meta.env.DEV &&
    (import.meta.env.VITE_HUBSPOT_ACCESS_TOKEN ||
      import.meta.env.VITE_PENDO_INTEGRATION_KEY)
  )
}

/** Call the Lambda API Gateway proxy (production path) */
export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `API error ${res.status} on ${path}`)
  }
  return res.json()
}

/** GET via Vite dev proxy (local dev only) */
export async function proxyGet(path) {
  const res = await fetch(path)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Proxy GET error ${res.status} on ${path}: ${text}`)
  }
  return res.json()
}

/** POST via Vite dev proxy (local dev only) */
export async function proxyPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Proxy POST error ${res.status} on ${path}: ${text}`)
  }
  return res.json()
}
