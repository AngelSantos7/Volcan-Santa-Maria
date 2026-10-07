import { supabase } from '../lib/supabase';
import type {
  AdminSession,
  AscentRow,
  AuditRow,
  DashboardPoint,
  DashboardStats,
  ReturnRow,
  SensitiveDetails,
  StaffPermissionRecord,
  StaffRow,
  VisitorRow,
  VisitorSummary,
  VisitorDirectoryRow,
  RegisteredVisitor,
  AdministrativeVisitResult,
  AscentMemberRow,
  VisitorReportData,
  OperationalDashboard,
  GalleryRow,
  IdentityDetails,
  OperationalContactDetails,
} from '../types';

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('No se recibió una respuesta.');
  return data;
}

export async function getAdminSession() {
  const { data, error } = await supabase.rpc('get_admin_session');
  return unwrap(data as AdminSession | null, error);
}

export async function getDashboard(from: string, to: string) {
  const [stats, series] = await Promise.all([
    supabase.rpc('get_visitor_dashboard_stats', { p_from: from, p_to: to }),
    supabase.rpc('get_visitor_dashboard_series', { p_from: from, p_to: to }),
  ]);
  return {
    stats: unwrap(stats.data as DashboardStats | null, stats.error),
    series: unwrap(series.data as DashboardPoint[] | null, series.error),
  };
}

export async function getOperationalDashboard() {
  const { data, error } = await supabase.rpc('get_operational_dashboard');
  return unwrap(data as OperationalDashboard | null, error);
}

export async function searchVisitors(filters: {
  search?: string;
  status?: string;
  from?: string | null;
  to?: string | null;
}) {
  const { data, error } = await supabase.rpc('staff_search_visitors', {
    p_search: filters.search || null,
    p_status: filters.status || 'all',
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_limit: 100,
    p_offset: 0,
  });
  return unwrap(data as VisitorRow[] | null, error);
}

export async function getVisitorSummary(userId: string, visitId: string) {
  const { data, error } = await supabase.rpc('staff_get_visitor_summary', {
    p_user_id: userId,
    p_visit_id: visitId,
  });
  return unwrap(data as VisitorSummary | null, error);
}

export async function getSensitiveDetails(
  userId: string,
  includeDocuments: boolean
) {
  const { data, error } = await supabase.rpc(
    'staff_get_visitor_sensitive_details',
    {
      p_user_id: userId,
      p_include_documents: includeDocuments,
    }
  );
  return unwrap(data as SensitiveDetails | null, error);
}

export async function getIdentityDetails(userId: string) {
  const { data, error } = await supabase.rpc('staff_get_identity_details', {
    p_user_id: userId,
  });
  return unwrap(data as IdentityDetails | null, error);
}

export async function getOperationalContacts(userId: string) {
  const { data, error } = await supabase.rpc('staff_get_operational_contacts', {
    p_user_id: userId,
    p_context: 'visitor_record',
  });
  return unwrap(data as OperationalContactDetails | null, error);
}

export async function listAscents(status: string, search = '') {
  const { data, error } = await supabase.rpc('staff_list_ascents', {
    p_status: status,
    p_limit: 100,
    p_search: search.trim() || null,
  });
  return unwrap(data as AscentRow[] | null, error);
}

export async function getAscentMembers(visitId: string) {
  const { data, error } = await supabase.rpc('staff_get_ascent_members', {
    p_visit_id: visitId,
  });
  return unwrap(data as AscentMemberRow[] | null, error);
}

export async function listReturns() {
  const { data, error } = await supabase.rpc('staff_list_return_controls', {
    p_limit: 100,
  });
  return unwrap(data as ReturnRow[] | null, error);
}

export async function listVisitorDirectory(search = '') {
  const { data, error } = await supabase.rpc('staff_list_visitor_directory', {
    p_search: search || null,
    p_limit: 250,
  });
  return unwrap(data as VisitorDirectoryRow[] | null, error);
}

export async function findVisitorByDocument(
  documentType: string,
  documentNumber: string
) {
  const { data, error } = await supabase.rpc('staff_find_visitor', {
    p_document_type: documentType,
    p_document_number: documentNumber,
  });
  if (error) throw new Error(error.message);
  return data as Pick<
    VisitorDirectoryRow,
    | 'visitor_id'
    | 'full_name'
    | 'nationality_country_code'
    | 'registration_origin'
  > | null;
}

export async function registerWalkInVisitor(input: {
  firstName: string;
  lastName: string;
  nationalityCountryCode: string;
  departmentCode?: string;
  dateOfBirth: string;
  sex: 'male' | 'female';
  phone?: string;
  alternatePhone?: string;
  documentType: 'dpi' | 'passport' | 'other';
  documentTypeDetail?: string;
  documentNumber: string;
  emergencyFirstName: string;
  emergencyLastName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
}) {
  const { data, error } = await supabase.rpc('staff_register_walk_in_visitor', {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_nationality_country_code: input.nationalityCountryCode,
    p_department_code: input.departmentCode || null,
    p_date_of_birth: input.dateOfBirth,
    p_phone: input.phone || null,
    p_alternate_phone: input.alternatePhone || null,
    p_document_type: input.documentType,
    p_document_type_detail: input.documentTypeDetail || null,
    p_document_number: input.documentNumber,
    p_emergency_first_name: input.emergencyFirstName,
    p_emergency_last_name: input.emergencyLastName,
    p_emergency_relationship: input.emergencyRelationship,
    p_emergency_phone: input.emergencyPhone,
  });
  const visitor = unwrap(data as RegisteredVisitor | null, error);
  const { error: sexError } = await supabase.rpc('staff_set_visitor_sex', {
    p_user_id: visitor.visitor_id,
    p_sex: input.sex,
  });
  if (sexError) throw new Error(sexError.message);
  return visitor;
}

export async function createAdministrativeVisit(input: {
  visitorIds: string[];
  organizerId: string;
  visitType: 'day_hike' | 'expedition_camping';
  startMode: 'now' | 'scheduled';
  plannedStartAt?: string;
  expectedReturnAt: string;
  hasLocalGuide: boolean;
  guideName?: string;
}) {
  const { data, error } = await supabase.rpc(
    'staff_create_administrative_visit',
    {
      p_visitor_ids: input.visitorIds,
      p_organizer_id: input.organizerId,
      p_visit_type: input.visitType,
      p_start_mode: input.startMode,
      p_planned_start_at: input.plannedStartAt || null,
      p_expected_return_at: input.expectedReturnAt,
      p_has_local_guide: input.hasLocalGuide,
      p_guide_name: input.guideName || null,
    }
  );
  return unwrap(data as AdministrativeVisitResult | null, error);
}

export async function startAdministrativeVisit(visitId: string) {
  const { error } = await supabase.rpc('staff_start_administrative_visit', {
    p_visit_id: visitId,
  });
  if (error) throw new Error(error.message);
}

export async function registerAdministrativeReturn(input: {
  visitId: string;
  visitorId?: string;
  group: boolean;
  reason: string;
  reasonDetail?: string;
  notes?: string;
  effectiveReturnAt?: string;
}) {
  const rpc = input.group
    ? supabase.rpc('staff_register_administrative_group_return', {
        p_visit_id: input.visitId,
        p_reason: input.reason,
        p_reason_detail: input.reasonDetail || null,
        p_notes: input.notes || null,
        p_effective_return_at: input.effectiveReturnAt || null,
      })
    : supabase.rpc('staff_register_administrative_return', {
        p_visit_id: input.visitId,
        p_user_id: input.visitorId,
        p_reason: input.reason,
        p_reason_detail: input.reasonDetail || null,
        p_notes: input.notes || null,
        p_effective_return_at: input.effectiveReturnAt || null,
      });
  const { error } = await rpc;
  if (error) throw new Error(error.message);
}

export async function listNotifications() {
  const { data, error } = await supabase.rpc('staff_list_notifications');
  return unwrap(data as import('../types').NotificationRow[] | null, error);
}

export async function saveNotification(input: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('staff_save_notification', {
    p_notification: input,
  });
  return unwrap(data as string | null, error);
}

export async function uploadNotificationImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('La imagen debe ser JPG, PNG o WebP.');
  }
  if (file.size > 5 * 1024 * 1024)
    throw new Error('La imagen no debe superar 5 MB.');
  const extension =
    file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from('notification-media')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return path;
}

export async function generateVisitorReport(
  from: string,
  to: string,
  reportType: 'summary' | 'detailed'
) {
  const { data, error } = await supabase.rpc('staff_generate_visitor_report', {
    p_from: from,
    p_to: to,
    p_report_type: reportType,
  });
  return unwrap(data as VisitorReportData | null, error);
}

export async function listStaff() {
  const { data, error } = await supabase.rpc('admin_list_staff');
  return unwrap(data as StaffRow[] | null, error);
}

export async function setStaffAccess(userId: string, active: boolean) {
  const { error } = await supabase.rpc('admin_set_staff_access', {
    p_user_id: userId,
    p_is_active: active,
  });
  if (error) throw new Error(error.message);
}

export async function getStaffPermissions(userId: string) {
  const { data, error } = await supabase.rpc('admin_get_staff_permissions', {
    p_user_id: userId,
  });
  return unwrap(data as StaffPermissionRecord | null, error);
}

export async function updateStaffPermissions(
  userId: string,
  permissions: Record<string, boolean>
) {
  const { error } = await supabase.rpc('admin_update_staff_permissions_v2', {
    p_user_id: userId,
    p_permissions: permissions,
  });
  if (error) throw new Error(error.message);
}

export async function activateMyStaffInvitation() {
  const { error } = await supabase.rpc('activate_my_staff_invitation');
  if (error) throw new Error(error.message);
}

export async function manageStaffInvitation(input: {
  action: 'invite' | 'resend' | 'delete';
  userId?: string;
  fullName?: string;
  email?: string;
  permissions?: Record<string, boolean>;
}) {
  const { data, error } = await supabase.functions.invoke('invite-staff', {
    body: input,
  });
  if (error) throw new Error(error.message);
  return data as { user_id?: string };
}

export async function listGallery(): Promise<GalleryRow[]> {
  const routeResult = await supabase
    .from('routes')
    .select('id')
    .eq('slug', 'ascenso-a-la-cima')
    .single<{ id: string }>();
  if (routeResult.error) throw new Error(routeResult.error.message);
  const { data, error } = await supabase
    .from('route_media')
    .select('id, route_id, storage_path, title_es, title_en, description_es, description_en, sort_order, is_active, updated_at')
    .eq('route_id', routeResult.data.id)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return Promise.all(((data ?? []) as GalleryRow[]).map(async (row) => {
    const signed = await supabase.storage.from('route-media').createSignedUrl(row.storage_path, 300);
    return { ...row, signed_url: signed.data?.signedUrl };
  }));
}

export async function uploadGalleryImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('La imagen debe ser JPG, PNG o WebP.');
  if (file.size > 5 * 1024 * 1024)
    throw new Error('La imagen no debe superar 5 MB.');
  const routeResult = await supabase.from('routes').select('id').eq('slug', 'ascenso-a-la-cima').single<{ id: string }>();
  if (routeResult.error) throw new Error(routeResult.error.message);
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${routeResult.data.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('route-media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function saveGalleryItem(input: Partial<GalleryRow> & { storage_path: string }) {
  const routeResult = await supabase.from('routes').select('id').eq('slug', 'ascenso-a-la-cima').single<{ id: string }>();
  if (routeResult.error) throw new Error(routeResult.error.message);
  const values = {
    route_id: routeResult.data.id,
    storage_path: input.storage_path,
    title_es: input.title_es || null,
    title_en: input.title_en || null,
    description_es: input.description_es || null,
    description_en: input.description_en || null,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
  };
  const authResult = await supabase.auth.getUser();
  const request = input.id
    ? supabase.from('route_media').update(values).eq('id', input.id)
    : supabase.from('route_media').insert({ ...values, created_by: authResult.data.user?.id ?? null });
  const { error } = await request;
  if (error) throw new Error(error.message);
}

export async function deleteGalleryItem(row: GalleryRow) {
  const { error } = await supabase.from('route_media').delete().eq('id', row.id);
  if (error) throw new Error(error.message);
  const storageResult = await supabase.storage.from('route-media').remove([row.storage_path]);
  if (storageResult.error) throw new Error(storageResult.error.message);
}

export async function deleteGalleryStoragePath(storagePath: string) {
  const { error } = await supabase.storage.from('route-media').remove([storagePath]);
  if (error) throw new Error(error.message);
}

export async function listAudit(filters: {
  from?: string | null;
  to?: string | null;
  action?: string;
  actor?: string;
}) {
  const { data, error } = await supabase.rpc('admin_list_audit_logs', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_action: filters.action || null,
    p_actor_search: filters.actor || null,
    p_limit: 200,
  });
  return unwrap(data as AuditRow[] | null, error);
}
