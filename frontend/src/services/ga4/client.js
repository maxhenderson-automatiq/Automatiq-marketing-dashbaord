/**
 * Google Analytics 4 — Data API client
 *
 * NOTE: GA4 requires OAuth or a service account — cannot be called
 * directly from the browser safely. For production, route through
 * a Lambda that holds the service account credentials.
 *
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1
 */

const PROPERTY_ID = import.meta.env.VITE_GA4_PROPERTY_ID

export async function ga4Report(body) {
  // Placeholder — implement via proxy in production
  throw new Error('GA4 requires a server-side proxy. See src/services/ga4/client.js')
}
