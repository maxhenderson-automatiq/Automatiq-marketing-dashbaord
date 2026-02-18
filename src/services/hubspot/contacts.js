import { hubspotGet } from './client'

/** Mock data used when no token is set */
const MOCK_SUMMARY = {
  total: 8412,
  newThisMonth: 342,
  byLifecycle: [
    { stage: 'Subscriber', count: 1200 },
    { stage: 'Lead', count: 3100 },
    { stage: 'MQL', count: 1800 },
    { stage: 'SQL', count: 900 },
    { stage: 'Opportunity', count: 620 },
    { stage: 'Customer', count: 792 },
  ],
}

const MOCK_TREND = Array.from({ length: 12 }, (_, i) => ({
  month: new Date(2025, i, 1).toLocaleString('default', { month: 'short' }),
  contacts: 6000 + i * 200 + Math.floor(Math.random() * 150),
}))

export async function getContactSummary() {
  if (!import.meta.env.VITE_HUBSPOT_ACCESS_TOKEN) {
    return MOCK_SUMMARY
  }
  // TODO: implement real call
  // const data = await hubspotGet('/crm/v3/objects/contacts', { limit: 1 })
  // return transform(data)
  return MOCK_SUMMARY
}

export async function getContactTrend() {
  if (!import.meta.env.VITE_HUBSPOT_ACCESS_TOKEN) {
    return MOCK_TREND
  }
  // TODO: implement real call
  return MOCK_TREND
}
