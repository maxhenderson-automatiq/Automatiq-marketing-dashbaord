/**
 * HubSpot deals service
 *
 * Local dev:  uses Vite proxy at /proxy/hubspot → api.hubapi.com
 * Production: calls /hubspot/* on the Lambda API Gateway proxy
 */
import { apiGet, proxyGet, proxyPost, isLocalDev } from '../client'

// ─── Local dev (real API) ─────────────────────────────────────────────────

export async function fetchPipelinesDirect() {
  const data = await proxyGet('/proxy/hubspot/crm/v3/pipelines/deals')
  return (data.results ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    stages: (p.stages ?? []).map((s) => ({ id: s.id, label: s.label })),
  }))
}

async function fetchDealsDirect(pipelineId) {
  const pipelines = await fetchPipelinesDirect()

  // Build stage label map for the selected pipeline (or all)
  const stageLabels = {}
  for (const pipeline of pipelines) {
    if (!pipelineId || pipeline.id === pipelineId) {
      for (const stage of pipeline.stages) {
        stageLabels[stage.id] = stage.label
      }
    }
  }

  // Fetch deals filtered by pipeline if specified
  const filters = pipelineId
    ? [{ propertyName: 'pipeline', operator: 'EQ', value: pipelineId }]
    : []

  const data = await proxyPost('/proxy/hubspot/crm/v3/objects/deals/search', {
    filterGroups: filters.length ? [{ filters }] : [],
    limit: 100,
    properties: ['dealstage', 'amount', 'pipeline', 'closedate', 'dealname'],
    sorts: [{ propertyName: 'amount', direction: 'DESCENDING' }],
  })

  // Group by stage
  const byStage = {}
  for (const deal of data.results ?? []) {
    const stageId = deal.properties?.dealstage ?? 'unknown'
    const label = stageLabels[stageId] ?? stageId
    if (!byStage[label]) byStage[label] = { stage: label, count: 0, amount: 0 }
    byStage[label].count++
    byStage[label].amount += parseFloat(deal.properties?.amount ?? 0)
  }

  return Object.values(byStage).sort((a, b) => b.amount - a.amount)
}

// ─── Exports ──────────────────────────────────────────────────────────────

export async function getDealPipeline(pipelineId) {
  if (isLocalDev()) return fetchDealsDirect(pipelineId)
  return apiGet(`/hubspot/deals${pipelineId ? `?pipeline=${pipelineId}` : ''}`)
}

export async function getPipelines() {
  if (isLocalDev()) return fetchPipelinesDirect()
  return apiGet('/hubspot/pipelines')
}
