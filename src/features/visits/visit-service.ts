import { supabase } from '../../lib/supabase';
import type {
  CreateGroupVisitInput,
  GroupVisitDetails,
  GroupVisitMemberRole,
  GroupVisitParticipant,
  GroupVisitStatus,
  EarlyReturnReason,
  VisitHistoryItem,
  VisitHistoryMember,
  VisitMemberStatus,
  VisitType,
} from './visit-types';

type ActiveVisitRow = {
  visit_id: string;
  status: GroupVisitStatus;
};

type ParticipantRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  member_role: GroupVisitMemberRole;
  member_status: VisitMemberStatus;
  joined_at: string;
  return_started_at: string | null;
  checked_out_at: string | null;
};

type GroupVisitDetailsRow = {
  visit_id: string;
  route_id: string;
  route_name_es: string;
  route_name_en: string;
  status: GroupVisitStatus;
  join_code: string | null;
  visit_type: VisitType;
  has_local_guide: boolean;
  guide_name: string | null;
  started_at: string | null;
  expected_return_at: string | null;
  completed_at: string | null;
  created_by: string;
  participants: ParticipantRow[];
};

type CreatedVisitRow = {
  visit_id: string;
  join_code: string;
};

type VisitHistoryRow = {
  visit_id: string;
  visit_date: string;
  visit_type: VisitType;
  visit_status: GroupVisitStatus;
  route_name_es: string;
  route_name_en: string;
  member_role: GroupVisitMemberRole;
  member_status: VisitMemberStatus;
  started_at: string | null;
  expected_return_at: string | null;
  completed_at: string | null;
  return_started_at: string | null;
  checked_out_at: string | null;
  participant_count: number;
};

type VisitHistoryMemberRow = {
  first_name: string;
  last_name: string;
  member_role: GroupVisitMemberRole;
  member_status: VisitMemberStatus;
  checked_out_at: string | null;
};

function firstRow<Row>(data: unknown): Row | null {
  return Array.isArray(data) && data.length > 0 ? (data[0] as Row) : null;
}

function mapParticipant(row: ParticipantRow): GroupVisitParticipant {
  return {
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    memberRole: row.member_role,
    memberStatus: row.member_status,
    joinedAt: row.joined_at,
    returnStartedAt: row.return_started_at,
    checkedOutAt: row.checked_out_at,
  };
}

function mapDetails(row: GroupVisitDetailsRow): GroupVisitDetails {
  return {
    visitId: row.visit_id,
    routeId: row.route_id,
    routeNameEs: row.route_name_es,
    routeNameEn: row.route_name_en,
    status: row.status,
    joinCode: row.join_code,
    visitType: row.visit_type,
    hasLocalGuide: row.has_local_guide,
    guideName: row.guide_name,
    startedAt: row.started_at,
    expectedReturnAt: row.expected_return_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    participants: Array.isArray(row.participants)
      ? row.participants.map(mapParticipant)
      : [],
  };
}

export async function getMyActiveGroupVisit(): Promise<ActiveVisitRow | null> {
  const { data, error } = await supabase.rpc('get_my_active_group_visit');

  if (error) throw error;
  return firstRow<ActiveVisitRow>(data);
}

export async function getGroupVisitDetails(
  visitId: string
): Promise<GroupVisitDetails> {
  const { data, error } = await supabase.rpc('get_group_visit_details', {
    p_visit_id: visitId,
  });

  if (error) throw error;

  const row = firstRow<GroupVisitDetailsRow>(data);
  if (!row) throw new Error('Group visit details were not returned');

  return mapDetails(row);
}

export async function createGroupVisit(
  input: CreateGroupVisitInput
): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_visit', {
    p_visit_type: input.visitType,
    p_expected_return_at: input.expectedReturnAt,
    p_has_local_guide: input.hasLocalGuide,
    p_guide_name: input.guideName,
    p_terms_accepted: true,
  });

  if (error) throw error;

  const row = firstRow<CreatedVisitRow>(data);
  if (!row) throw new Error('Created group visit was not returned');

  return row.visit_id;
}

export async function joinGroupVisit(joinCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group_visit', {
    join_code: joinCode,
    terms_accepted: true,
  });

  if (error) throw error;
  if (typeof data !== 'string')
    throw new Error('Joined group visit was not returned');

  return data;
}

async function runVisitAction(
  functionName:
    'start_group_visit' | 'complete_group_visit' | 'cancel_group_visit',
  visitId: string
): Promise<void> {
  const { error } = await supabase.rpc(functionName, { visit_id: visitId });
  if (error) throw error;
}

export function startGroupVisit(visitId: string): Promise<void> {
  return runVisitAction('start_group_visit', visitId);
}

export function completeGroupVisit(visitId: string): Promise<void> {
  return runVisitAction('complete_group_visit', visitId);
}

export function cancelGroupVisit(visitId: string): Promise<void> {
  return runVisitAction('cancel_group_visit', visitId);
}

async function runMemberAction(
  functionName: 'withdraw_from_group' | 'confirm_my_early_checkout',
  visitId: string
): Promise<void> {
  const { error } = await supabase.rpc(functionName, {
    p_visit_id: visitId,
  });
  if (error) throw error;
}

export function withdrawFromGroup(visitId: string): Promise<void> {
  return runMemberAction('withdraw_from_group', visitId);
}

export function confirmMyEarlyCheckout(visitId: string): Promise<void> {
  return runMemberAction('confirm_my_early_checkout', visitId);
}

export async function removeMemberBeforeStart(
  visitId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('remove_member_before_start', {
    p_visit_id: visitId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function startEarlyReturn(
  visitId: string,
  reason: EarlyReturnReason,
  notes: string | null
): Promise<void> {
  const { error } = await supabase.rpc('start_early_return', {
    p_visit_id: visitId,
    p_reason: reason,
    p_notes: notes,
  });
  if (error) throw error;
}

export async function markMemberReturningEarly(
  visitId: string,
  userId: string,
  reason: EarlyReturnReason,
  notes: string | null
): Promise<void> {
  const { error } = await supabase.rpc('mark_member_returning_early', {
    p_visit_id: visitId,
    p_user_id: userId,
    p_reason: reason,
    p_notes: notes,
  });
  if (error) throw error;
}

export async function getMyVisitHistory(
  limit: number,
  offset: number
): Promise<VisitHistoryItem[]> {
  const { data, error } = await supabase.rpc('get_my_visit_history', {
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw error;
  if (!Array.isArray(data)) return [];

  return (data as VisitHistoryRow[]).map((row) => ({
    visitId: row.visit_id,
    visitDate: row.visit_date,
    visitType: row.visit_type,
    visitStatus: row.visit_status,
    routeNameEs: row.route_name_es,
    routeNameEn: row.route_name_en,
    memberRole: row.member_role,
    memberStatus: row.member_status,
    startedAt: row.started_at,
    expectedReturnAt: row.expected_return_at,
    completedAt: row.completed_at,
    returnStartedAt: row.return_started_at,
    checkedOutAt: row.checked_out_at,
    participantCount: row.participant_count,
  }));
}

export async function getVisitHistoryMembers(
  visitId: string
): Promise<VisitHistoryMember[]> {
  const { data, error } = await supabase.rpc('get_visit_history_members', {
    p_visit_id: visitId,
  });

  if (error) throw error;
  if (!Array.isArray(data)) return [];

  return (data as VisitHistoryMemberRow[]).map((row) => ({
    firstName: row.first_name,
    lastName: row.last_name,
    memberRole: row.member_role,
    memberStatus: row.member_status,
    checkedOutAt: row.checked_out_at,
  }));
}
