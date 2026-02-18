import { useLocation } from 'react-router-dom'
import './Header.css'

const PAGE_TITLES = {
  '/dashboard': 'Overview',
  '/hubspot': 'HubSpot',
  '/pendo': 'Pendo',
}

export default function Header() {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'Analytics Dashboard'

  return (
    <header className="header">
      <h1 className="header-title">{title}</h1>
      <div className="header-meta">
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
