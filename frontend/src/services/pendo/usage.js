import { apiGet } from '../client'

const MOCK_DAU = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }),
  dau: 400 + Math.floor(Math.random() * 200),
}))

const MOCK_FEATURES = [
  { feature: 'Dashboard', views: 9200 },
  { feature: 'Reports', views: 6100 },
  { feature: 'Settings', views: 3400 },
  { feature: 'Integrations', views: 2800 },
  { feature: 'Admin', views: 1200 },
]

export async function getDailyActiveUsers() {
  if (!import.meta.env.VITE_API_BASE_URL) return MOCK_DAU
  return apiGet('/pendo/dau')
}

export async function getTopFeatures() {
  if (!import.meta.env.VITE_API_BASE_URL) return MOCK_FEATURES
  return apiGet('/pendo/features')
}
