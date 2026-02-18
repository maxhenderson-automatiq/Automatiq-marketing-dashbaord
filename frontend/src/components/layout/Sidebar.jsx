import { NavLink } from 'react-router-dom'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: '⬛' },
  { to: '/hubspot', label: 'HubSpot', icon: '🟠' },
  { to: '/pendo', label: 'Pendo', icon: '🔵' },
  // Add GA4 here later
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-text">Analytics</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`
            }
          >
            <span className="sidebar-icon">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-version">v0.1.0</span>
      </div>
    </aside>
  )
}
