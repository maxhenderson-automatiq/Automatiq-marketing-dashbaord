import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import ChartCard from '../components/ui/ChartCard'
import StatCard from '../components/ui/StatCard'
import { getDailyActiveUsers, getTopFeatures } from '../services/pendo/usage'
import './PendoPage.css'

export default function PendoPage() {
  const { data: dau } = useQuery({ queryKey: ['pendo-dau'], queryFn: getDailyActiveUsers })
  const { data: features } = useQuery({ queryKey: ['pendo-features'], queryFn: getTopFeatures })

  const avgDau = dau?.length
    ? Math.round(dau.reduce((s, d) => s + d.dau, 0) / dau.length)
    : null

  return (
    <div className="pendo-page">
      <div className="pendo-stats">
        <StatCard label="Avg Daily Active Users" value={avgDau?.toLocaleString() ?? '—'} accent="orange" />
        <StatCard label="Peak DAU" value={dau ? Math.max(...dau.map(d => d.dau)).toLocaleString() : '—'} />
        <StatCard label="Top Feature" value={features?.[0]?.feature ?? '—'} />
        <StatCard label="Top Feature Views" value={features?.[0]?.views?.toLocaleString() ?? '—'} accent="blue" />
      </div>

      <ChartCard title="Daily Active Users — Last 30 Days">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={dau ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="dau" stroke="#f97316" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Feature Adoption (Page Views)">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={features ?? []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis dataKey="feature" type="category" tick={{ fontSize: 13 }} width={110} />
            <Tooltip />
            <Bar dataKey="views" fill="#f97316" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
