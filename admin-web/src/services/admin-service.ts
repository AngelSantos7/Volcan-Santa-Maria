import { supabase } from '../lib/supabase'
import type {
  AdminSession, AscentRow, AuditRow, DashboardPoint, DashboardStats,
  ReturnRow, SensitiveDetails, StaffPermissionRecord, StaffRow,
  VisitorRow, VisitorSummary,
} from '../types'

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('No se recibió una respuesta.')
  return data
}

export async function getAdminSession() {
  const { data, error } = await supabase.rpc('get_admin_session')
  return unwrap(data as AdminSession | null, error)
}

export async function getDashboard(from: string, to: string) {
  const [stats, series] = await Promise.all([
    supabase.rpc('get_visitor_dashboard_stats', { p_from: from, p_to: to }),
    supabase.rpc('get_visitor_dashboard_series', { p_from: from, p_to: to }),
  ])
  return {
    stats: unwrap(stats.data as DashboardStats | null, stats.error),
    series: unwrap(series.data as DashboardPoint[] | null, series.error),
  }
}

export async function searchVisitors(filters: {
  search?: string
  status?: string
  from?: string | null
  to?: string | null
}) {
  const { data, error } = await supabase.rpc('staff_search_visitors', {
    p_search: filters.search || null,
    p_status: filters.status || 'all',
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_limit: 100,
    p_offset: 0,
  })
  return unwrap(data as VisitorRow[] | null, error)
}

export async function getVisitorSummary(userId: string, visitId: string) {
  const { data, error } = await supabase.rpc('staff_get_visitor_summary', {
    p_user_id: userId,
    p_visit_id: visitId,
  })
  return unwrap(data as VisitorSummary | null, error)
}

export async function getSensitiveDetails(userId: string, includeDocuments: boolean) {
  const { data, error } = await supabase.rpc('staff_get_visitor_sensitive_details', {
    p_user_id: userId,
    p_include_documents: includeDocuments,
  })
  return unwrap(data as SensitiveDetails | null, error)
}

export async function listAscents(status: string) {
  const { data, error } = await supabase.rpc('staff_list_ascents', { p_status: status, p_limit: 100 })
  return unwrap(data as AscentRow[] | null, error)
}

export async function listReturns() {
  const { data, error } = await supabase.rpc('staff_list_return_controls', { p_limit: 100 })
  return unwrap(data as ReturnRow[] | null, error)
}

export async function listStaff() {
  const { data, error } = await supabase.rpc('admin_list_staff')
  return unwrap(data as StaffRow[] | null, error)
}

export async function setStaffAccess(userId: string, active: boolean) {
  const { error } = await supabase.rpc('admin_set_staff_access', { p_user_id: userId, p_is_active: active })
  if (error) throw new Error(error.message)
}

export async function getStaffPermissions(userId: string) {
  const { data, error } = await supabase.rpc('admin_get_staff_permissions', { p_user_id: userId })
  return unwrap(data as StaffPermissionRecord | null, error)
}

export async function updateStaffPermissions(userId: string, permissions: Record<string, boolean>) {
  const { error } = await supabase.rpc('admin_update_staff_permissions', {
    p_user_id: userId,
    p_permissions: permissions,
  })
  if (error) throw new Error(error.message)
}

export async function listAudit(filters: {
  from?: string | null
  to?: string | null
  action?: string
  actor?: string
}) {
  const { data, error } = await supabase.rpc('admin_list_audit_logs', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_action: filters.action || null,
    p_actor_search: filters.actor || null,
    p_limit: 200,
  })
  return unwrap(data as AuditRow[] | null, error)
}
