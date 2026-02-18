import { NavLink } from 'react-router-dom'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: '⬛' },
  {
    label: 'HubSpot',
    icon: '🟠',
    children: [
      { to: '/hubspot', label: 'CRM Overview' },
      { to: '/hubspot/insights', label: 'Mktg Insights' },
    ],
  },
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
        {NAV_ITEMS.map((item) =>
          item.children ? (
            <div key={item.label} className="sidebar-group">
              <span className="sidebar-group-label">
                <span className="sidebar-icon">{item.icon}</span>
                {item.label}
              </span>
              {item.children.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={({ isActive }) =>
                    `sidebar-link sidebar-link--child ${isActive ? 'sidebar-link--active' : ''}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`
              }
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        )}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-version">v0.1.0</span>
      </div>
    </aside>
  )
}
