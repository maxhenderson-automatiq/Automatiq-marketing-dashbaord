import { apiGet } from '../client'

const MOCK_PIPELINE = [
  { stage: 'Appointment Scheduled', count: 42, amount: 210000 },
  { stage: 'Qualified to Buy', count: 28, amount: 420000 },
  { stage: 'Presentation Scheduled', count: 19, amount: 380000 },
  { stage: 'Decision Maker Bought-In', count: 11, amount: 275000 },
  { stage: 'Contract Sent', count: 8, amount: 320000 },
  { stage: 'Closed Won', count: 5, amount: 198000 },
]

export async function getDealPipeline() {
  if (!import.meta.env.VITE_API_BASE_URL) return MOCK_PIPELINE
  return apiGet('/hubspot/deals')
}
