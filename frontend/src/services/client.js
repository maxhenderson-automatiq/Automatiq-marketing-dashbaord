/**
 * Shared fetch wrapper for the backend API proxy.
 * All credentials live in Lambda env vars — the frontend only knows the base URL.
 *
 * Local dev:  set VITE_API_BASE_URL=http://localhost:3000 in .env.local
 *             then run `sam local start-api` in backend/
 * Production: VITE_API_BASE_URL is injected by GitHub Actions from repo secrets
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `API error ${res.status} on ${path}`)
  }
  return res.json()
}
