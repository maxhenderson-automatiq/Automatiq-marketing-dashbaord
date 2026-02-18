import { useLocation } from 'react-router-dom'
import { isLocalDev } from '../../services/client'
import './Header.css'

const PAGE_TITLES = {
  '/dashboard': 'Overview',
  '/hubspot': 'HubSpot — CRM Overview',
  '/hubspot/insights': 'HubSpot — Marketing Insights',
  '/pendo': 'Pendo',
}

const dataMode = (() => {
  if (isLocalDev()) return { label: 'Live (dev proxy)', color: 'var(--color-green)' }
  if (import.meta.env.VITE_API_BASE_URL) return { label: 'Live (API gateway)', color: 'var(--color-green)' }
  return { label: 'Mock data', color: 'var(--color-orange)' }
})()

export default function Header() {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'Analytics Dashboard'

  return (
    <header className="header">
      <h1 className="header-title">{title}</h1>
      <div className="header-meta">
        <span className="header-data-mode" style={{ color: dataMode.color }}>
          ● {dataMode.label}
        </span>
        <span className="header-date">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>
    </header>
  )
}
