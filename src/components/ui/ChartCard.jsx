import './ChartCard.css'

export default function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`chart-card ${className}`}>
      {title && <h2 className="chart-card-title">{title}</h2>}
      <div className="chart-card-body">{children}</div>
    </div>
  )
}
