import './StatCard.css'

export default function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card ${accent ? `stat-card--${accent}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}
