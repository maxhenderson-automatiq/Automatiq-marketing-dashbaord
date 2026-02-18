import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import ChartCard from '../components/ui/ChartCard'
import StatCard from '../components/ui/StatCard'
import { getContactSummary, getContactTrend } from '../services/hubspot/contacts'
import { getDealPipeline } from '../services/hubspot/deals'
import './HubSpotPage.css'

const COLORS = ['#6366f1', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899']

export default function HubSpotPage() {
  const { data: contacts, isLoading: loadingContacts } = useQuery({
    queryKey: ['contacts-summary'],
    queryFn: getContactSummary,
  })
  const { data: pipeline } = useQuery({
    queryKey: ['deal-pipeline'],
    queryFn: getDealPipeline,
  })

  return (
    <div className="hubspot-page">
      <div className="hubspot-stats">
        <StatCard label="Total Contacts" value={contacts?.total?.toLocaleString() ?? '—'} accent="blue" />
        <StatCard label="New This Month" value={contacts?.newThisMonth?.toLocaleString() ?? '—'} accent="green" />
        <StatCard label="Pipeline Stages" value={pipeline?.length ?? '—'} />
        <StatCard
          label="Total Deal Value"
          value={`$${((pipeline ?? []).reduce((s, d) => s + d.amount, 0) / 1000).toFixed(0)}k`}
          accent="orange"
        />
      </div>

      <div className="hubspot-charts">
        <ChartCard title="Contacts by Lifecycle Stage">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={contacts?.byLifecycle ?? []} dataKey="count" nameKey="stage" outerRadius={110}>
                {(contacts?.byLifecycle ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Deal Pipeline — Amount by Stage">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pipeline ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
              <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
