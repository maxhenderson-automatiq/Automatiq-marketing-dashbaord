import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import StatCard from '../components/ui/StatCard'
import ChartCard from '../components/ui/ChartCard'
import { getContactSummary, getContactTrend } from '../services/hubspot/contacts'
import { getDealPipeline } from '../services/hubspot/deals'
import { getDailyActiveUsers, getTopFeatures } from '../services/pendo/usage'
import './DashboardPage.css'

const COLORS = ['#6366f1', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899']

export default function DashboardPage() {
  const { data: contacts } = useQuery({ queryKey: ['contacts-summary'], queryFn: getContactSummary })
  const { data: contactTrend } = useQuery({ queryKey: ['contacts-trend'], queryFn: getContactTrend })
  const { data: pipeline } = useQuery({ queryKey: ['deal-pipeline'], queryFn: getDealPipeline })
  const { data: dau } = useQuery({ queryKey: ['pendo-dau'], queryFn: getDailyActiveUsers })
  const { data: features } = useQuery({ queryKey: ['pendo-features'], queryFn: getTopFeatures })

  const totalPipelineValue = pipeline?.reduce((s, d) => s + d.amount, 0) ?? 0

  return (
    <div className="dashboard">
      {/* KPI row */}
      <div className="dashboard-stats">
        <StatCard
          label="Total Contacts"
          value={contacts?.total?.toLocaleString() ?? '—'}
          sub={`+${contacts?.newThisMonth ?? 0} this month`}
          accent="blue"
        />
        <StatCard
          label="Pipeline Value"
          value={`$${(totalPipelineValue / 1000).toFixed(0)}k`}
          sub={`${pipeline?.length ?? 0} stages`}
          accent="green"
        />
        <StatCard
          label="Daily Active Users"
          value={dau?.[dau.length - 1]?.dau?.toLocaleString() ?? '—'}
          sub="Yesterday (Pendo)"
          accent="orange"
        />
        <StatCard
          label="Top Feature Views"
          value={features?.[0]?.views?.toLocaleString() ?? '—'}
          sub={features?.[0]?.feature ?? ''}
        />
      </div>

      {/* Charts row 1 */}
      <div className="dashboard-charts">
        <ChartCard title="Contact Growth (12 mo)" className="chart-wide">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={contactTrend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="contacts" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lifecycle Breakdown">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={contacts?.byLifecycle ?? []}
                dataKey="count"
                nameKey="stage"
                cx="50%"
                cy="50%"
                outerRadius={80}
              >
                {(contacts?.byLifecycle ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="dashboard-charts">
        <ChartCard title="Daily Active Users (30d)" className="chart-wide">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dau ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="dau" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Features (Pendo)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={features ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="feature" type="category" tick={{ fontSize: 12 }} width={90} />
              <Tooltip />
              <Bar dataKey="views" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Deal pipeline */}
      <ChartCard title="Deal Pipeline by Stage">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={pipeline ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v, n) => n === 'amount' ? `$${v.toLocaleString()}` : v} />
            <Bar dataKey="amount" name="Amount ($)" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="count" name="Deals" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
