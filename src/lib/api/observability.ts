// ============ Observability API (types + functions) ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

// ============ Observability Types ============

export type AlertSeverity_Ops = 'CRITICAL' | 'WARNING' | 'INFO'

export interface Alert {
  id: string
  alert_code: string
  severity: AlertSeverity_Ops
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  administration_id: string | null
  context: string | null
  created_at: string
  acknowledged_at: string | null
  acknowledged_by_id: string | null
  resolved_at: string | null
  resolved_by_id: string | null
  resolution_notes: string | null
  auto_resolved: boolean
}

export interface AlertListResponse {
  alerts: Alert[]
  total_count: number
  active_count: number
  acknowledged_count: number
  critical_count: number
  warning_count: number
  info_count: number
}

export interface AlertCountsResponse {
  critical: number
  warning: number
  info: number
  total: number
}

export interface AlertGroupedResponse {
  critical: Alert[]
  warning: Alert[]
  info: Alert[]
  counts: AlertCountsResponse
}

export interface HealthComponent {
  status: 'healthy' | 'unhealthy' | 'warning' | 'unknown'
  message: string | null
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  components: {
    database: HealthComponent
    redis: HealthComponent
    migrations: HealthComponent
    background_tasks: HealthComponent
  }
}

export interface MetricsSummary {
  documents_processed_today: number
  issues_created_today: number
  red_issues_active: number
  decisions_approved_today: number
  decisions_rejected_today: number
  postings_created_today: number
  failed_operations_count: number
  active_critical_alerts: number
}

export interface MetricsResponse {
  timestamp: string
  scope: 'client' | 'global'
  administration_id: string | null
  documents: {
    documents_processed_today: number
    documents_uploaded_today: number
    documents_failed_today: number
    documents_by_status: Record<string, number>
    documents_pending_review: number
    documents_in_processing: number
  }
  issues: {
    issues_created_today: { red: number; yellow: number; total: number }
    active_issues: { red: number; yellow: number; total: number }
    issues_resolved_today: number
  }
  decisions: {
    decisions_today: { approved: number; rejected: number; overridden: number; total: number }
    execution_today: { executed: number; failed: number; pending: number }
  }
  postings: {
    postings_created_today: number
    draft_entries: number
    entries_by_status: Record<string, number>
  }
  alerts: {
    active_alerts: { critical: number; warning: number; info: number; total: number }
    alerts_created_today: number
    alerts_resolved_today: number
  }
  summary: MetricsSummary
}

// Observability API
export const observabilityApi = {
  getHealth: async (): Promise<HealthResponse> => {
    const response = await api.get<HealthResponse>('/health')
    return response.data
  },

  getMetrics: async (administrationId?: string): Promise<MetricsResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<MetricsResponse>('/ops/metrics', { params })
    return response.data
  },

  listAlerts: async (
    administrationId?: string,
    severity?: AlertSeverity_Ops,
    includeResolved = false,
    limit = 100
  ): Promise<AlertListResponse> => {
    const params: Record<string, unknown> = { include_resolved: includeResolved, limit }
    if (administrationId) params.administration_id = administrationId
    if (severity) params.severity = severity
    const response = await api.get<AlertListResponse>('/ops/alerts', { params })
    return response.data
  },

  getAlertsGrouped: async (administrationId?: string): Promise<AlertGroupedResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<AlertGroupedResponse>('/ops/alerts/grouped', { params })
    return response.data
  },

  getAlertCounts: async (administrationId?: string): Promise<AlertCountsResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<AlertCountsResponse>('/ops/alerts/counts', { params })
    return response.data
  },

  getAlert: async (alertId: string): Promise<Alert> => {
    const response = await api.get<Alert>(`/ops/alerts/${alertId}`)
    return response.data
  },

  acknowledgeAlert: async (alertId: string): Promise<Alert> => {
    const response = await api.post<Alert>(`/ops/alerts/${alertId}/acknowledge`)
    return response.data
  },

  resolveAlert: async (alertId: string, notes?: string): Promise<Alert> => {
    const response = await api.post<Alert>(`/ops/alerts/${alertId}/resolve`, { notes })
    return response.data
  },

  runAlertChecks: async (administrationId: string): Promise<AlertListResponse> => {
    const response = await api.post<AlertListResponse>(`/ops/alerts/check/${administrationId}`)
    return response.data
  },
}
