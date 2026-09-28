export type AppRole = 'tourist' | 'visitor_manager' | 'admin';

export type PermissionKey =
  | 'can_view_visitors'
  | 'can_view_sensitive_data'
  | 'can_view_identity_documents'
  | 'can_manage_visits'
  | 'can_confirm_returns'
  | 'can_register_walk_in_visitors'
  | 'can_export_reports'
  | 'can_manage_announcements'
  | 'can_manage_route'
  | 'can_manage_users'
  | 'can_manage_staff';

export type Permissions = Record<PermissionKey, boolean>;

export interface AdminSession {
  user_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role: AppRole;
  is_active: boolean;
  permissions: Partial<Permissions>;
}

export interface DashboardStats {
  visitors_registered: number;
  entries_registered: number;
  exits_registered: number;
  currently_on_route: number;
  ascents_total: number;
  ascents_group: number;
  ascents_individual: number;
  ascents_started: number;
  ascents_scheduled: number;
  ascents_completed: number;
  early_returns: number;
  pending_returns: number;
}

export interface DashboardPoint {
  report_date: string;
  visitors: number;
  ascents: number;
  exits: number;
  early_returns: number;
}

export interface VisitorRow {
  user_id: string;
  visit_id: string;
  full_name: string;
  nationality_country_code: string | null;
  avatar_kind: string | null;
  avatar_path: string | null;
  avatar_preset: string | null;
  group_type: 'group' | 'individual';
  member_status: string;
  visit_status: string;
  planned_start_at: string | null;
  started_at: string | null;
  expected_return_at: string | null;
  participant_count: number;
  total_count: number;
}

export interface VisitorSummary {
  user_id: string;
  visit_id: string;
  first_name: string;
  last_name: string;
  nationality_country_code: string | null;
  avatar_kind: string | null;
  avatar_path: string | null;
  avatar_preset: string | null;
  member_role: string;
  member_status: string;
  visit_status: string;
  join_code: string;
  visit_type: string;
  route_name: string;
  planned_start_at: string | null;
  started_at: string | null;
  expected_return_at: string | null;
  completed_at: string | null;
  return_started_at: string | null;
  checked_out_at: string | null;
  participant_count: number;
  registration_origin: 'self' | 'administrative';
  registered_by: string | null;
  registered_at: string | null;
  creation_origin: 'tourist' | 'administrative';
  created_by_staff: string | null;
  administrative_created_at: string | null;
  finalized_by_administration: boolean;
  administrative_return_recorded_at: string | null;
  history: Array<Record<string, string | null>>;
}

export interface SensitiveDetails {
  date_of_birth: string | null;
  phone: string | null;
  alternate_phone: string | null;
  document_type: string | null;
  document_number: string | null;
  emergency_contact: {
    first_name: string;
    last_name: string;
    relationship: string;
    phone: string;
  } | null;
}

export interface AscentRow {
  visit_id: string;
  join_code: string;
  organizer_name: string;
  visit_type: string;
  participant_count: number;
  planned_start_at: string | null;
  started_at: string | null;
  expected_return_at: string | null;
  completed_at: string | null;
  visit_status: string;
  creation_origin: 'tourist' | 'administrative';
  finalized_by_administration: boolean;
}

export interface ReturnRow {
  visit_id: string;
  user_id: string;
  visitor_name: string;
  join_code: string;
  member_status: string;
  started_at: string | null;
  expected_return_at: string | null;
  return_started_at: string | null;
  checked_out_at: string | null;
  attention_state: string;
  participant_count: number;
  creation_origin: 'tourist' | 'administrative';
  finalized_by_administration: boolean;
}

export interface VisitorDirectoryRow {
  visitor_id: string;
  full_name: string;
  nationality_country_code: string | null;
  registration_origin: 'self' | 'administrative';
  registered_at: string;
  latest_visit_id: string | null;
  latest_visit_status: string | null;
  latest_member_status: string | null;
}

export interface RegisteredVisitor {
  visitor_id: string;
  first_name: string;
  last_name: string;
  registration_origin: 'administrative';
  registered_at: string;
}

export interface AdministrativeVisitResult {
  visit_id: string;
  join_code: string;
  participant_count: number;
  creation_origin: 'administrative';
}

export interface ReportDetailRow {
  event_date: string;
  visitor_name: string;
  nationality_country_code: string | null;
  join_code: string;
  ascent_type: string;
  started_at: string | null;
  expected_return_at: string | null;
  checked_out_at: string | null;
  duration_minutes: number | null;
  operational_status: string;
  creation_origin: 'tourist' | 'administrative';
  completion_method: 'normal' | 'administrative' | 'pending';
}

export interface VisitorReportData {
  generated_at: string;
  from: string;
  to: string;
  report_type: 'summary' | 'detailed';
  time_zone: 'America/Guatemala';
  summary: DashboardStats & { administrative_returns: number };
  nationality_breakdown: Array<{
    nationality_country_code: string | null;
    visitors: number;
  }>;
  rows: ReportDetailRow[];
}

export interface AscentMemberRow {
  visit_id: string;
  user_id: string;
  visitor_name: string;
  member_role: 'leader' | 'member';
  member_status: string;
  checked_out_at: string | null;
  finalized_by_administration: boolean;
}

export interface StaffRow {
  user_id: string;
  full_name: string;
  email: string;
  role: AppRole;
  is_active: boolean;
  updated_at: string;
}

export interface StaffPermissionRecord extends Permissions {
  user_id: string;
  role: AppRole;
  full_name: string;
  email: string;
  is_active: boolean;
  updated_at: string | null;
}

export interface AuditRow {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
}
