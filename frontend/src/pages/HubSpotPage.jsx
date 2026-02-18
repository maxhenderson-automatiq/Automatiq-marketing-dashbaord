import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import ChartCard from '../components/ui/ChartCard'
import StatCard from '../components/ui/StatCard'
import { getContactSummary } from '../services/hubspot/contacts'
import { getDealPipeline, getPipelines } from '../services/hubspot/deals'
import './HubSpotPage.css'

const COLORS = ['#6366f1', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899']

export default function HubSpotPage() {
  const [selectedPipeline, setSelectedPipeline] = useState('')

  const { data: contacts } = useQuery({
    queryKey: ['contacts-summary'],
    queryFn: getContactSummary,
  })

  const { data: allPipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn: getPipelines,
  })

  const { data: pipeline, isLoading: loadingDeals } = useQuery({
    queryKey: ['deal-pipeline', selectedPipeline],
    queryFn: () => getDealPipeline(selectedPipeline || undefined),
  })

  const totalDealValue = (pipeline ?? []).reduce((s, d) => s + d.amount, 0)

  return (
    <div className="hubspot-page">
      <div className="hubspot-stats">
        <StatCard label="Total Contacts" value={contacts?.total?.toLocaleString() ?? '—'} accent="blue" />
        <StatCard label="New This Month" value={contacts?.newThisMonth?.toLocaleString() ?? '—'} accent="green" />
        <StatCard label="Pipeline Stages" value={pipeline?.length ?? '—'} />
        <StatCard
          label="Total Deal Value"
          value={totalDealValue ? `$${(totalDealValue / 1000).toFixed(0)}k` : '—'}
          accent="orange"
        />
      </div>

      <div className="hubspot-charts">
        <ChartCard title="Contacts by Lifecycle Stage">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={contacts?.byLifecycle ?? []}
                dataKey="count"
                nameKey="stage"
                outerRadius={110}
              >
                {(contacts?.byLifecycle ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => v.toLocaleString()} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={
            <div className="chart-title-row">
              <span>Deal Pipeline — Amount by Stage</span>
              <select
                className="pipeline-select"
                value={selectedPipeline}
                onChange={(e) => setSelectedPipeline(e.target.value)}
              >
                <option value="">All pipelines</option>
                {(allPipelines ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pipeline ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={55} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
              <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} name="Amount" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
