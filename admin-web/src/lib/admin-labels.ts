const LABELS: Record<string, string> = {
  forming: 'En preparación', in_preparation: 'En preparación',
  scheduled: 'Planificado', scheduled_today: 'Planificado hoy',
  scheduled_future: 'Planificado', in_progress: 'En recorrido',
  pending_returns: 'Retornos pendientes', completed: 'Completado',
  cancelled: 'Cancelado', active: 'En recorrido',
  returning_early: 'Retorno anticipado', returned_early: 'Retornó antes',
  withdrawn_before_start: 'Retirado antes del inicio', overdue: 'Retorno atrasado',
  due_soon: 'Próximo a retornar', on_route: 'En recorrido',
  early_return: 'Retorno anticipado', early_return_completed: 'Retorno confirmado',
  administratively_completed: 'Completado por administración',
  no_active_ascent: 'Sin ascenso activo', active_access: 'Activo',
  inactive_access: 'Desactivado', pending: 'Pendiente', published: 'Publicada',
  draft: 'Borrador', expired: 'Vencida', info: 'Informativa',
  caution: 'Precaución', urgent: 'Urgente', male: 'Masculino', female: 'Femenino',
  child: 'Hijo/a', sibling: 'Hermano/a', niece_nephew: 'Sobrino/a',
  grandchild: 'Nieto/a', cousin: 'Primo/a', day_hike: 'Ascenso de un día',
  expedition_camping: 'Expedición y campamento',
  all_users: 'Todas las personas usuarias', specific_visit: 'Ascenso específico',
  specific_user: 'Visitante específico', planned: 'Planificados',
};

export function adminLabel(value: string | null | undefined): string {
  if (!value) return 'No disponible';
  if (value.startsWith('other:')) return value.slice(6);
  return LABELS[value] ?? value;
}

export const formatSex = adminLabel;
export const formatRelationship = adminLabel;
export const formatVisitType = adminLabel;

const AUDIT_ACTIONS: Record<string, string> = {
  sensitive_data_viewed: 'Consultó datos sensibles',
  identity_document_viewed: 'Consultó documento de identidad',
  emergency_contact_viewed: 'Consultó contacto de emergencia',
  visitor_registered: 'Registró visitante',
  administrative_visit_created: 'Creó ascenso administrativo',
  administrative_return_recorded: 'Registró retorno administrativo',
  user_role_changed: 'Cambió el rol',
  staff_permissions_changed: 'Cambió permisos',
  staff_activated: 'Activó gestor',
  staff_deactivated: 'Desactivó gestor',
  staff_invited: 'Invitó gestor',
  staff_invitation_resent: 'Reenvió invitación',
  staff_invitation_deleted: 'Eliminó invitación pendiente',
};

export function auditActionLabel(value: string): string {
  return AUDIT_ACTIONS[value] ?? adminLabel(value);
}

export function auditTargetLabel(targetType: string, metadata: Record<string, unknown>, targetId: string | null) {
  const name = typeof metadata.target_name === 'string' ? metadata.target_name : null;
  const code = typeof metadata.join_code === 'string' ? metadata.join_code : null;
  if (name) return name;
  if (code) return `Grupo ${code}`;
  const type = ({ visitor: 'Visitante', visit: 'Ascenso', staff_user: 'Gestor', notification: 'Notificación' } as Record<string, string>)[targetType] ?? 'Registro';
  return targetId ? `${type} · ${targetId.slice(0, 8)}` : type;
}
