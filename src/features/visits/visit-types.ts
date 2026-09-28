export type GroupVisitStatus =
  'forming' | 'in_progress' | 'completed' | 'cancelled';

export type GroupVisitMemberRole = 'leader' | 'member';

export type VisitType = 'day_hike' | 'expedition_camping';
export type VisitStartMode = 'now' | 'scheduled';

export type VisitMemberStatus =
  | 'active'
  | 'withdrawn_before_start'
  | 'returning_early'
  | 'returned_early'
  | 'completed';

export type EarlyReturnReason =
  | 'physical_discomfort'
  | 'injury'
  | 'emergency'
  | 'personal_decision'
  | 'other';

export type GroupVisitParticipant = {
  userId: string;
  firstName: string;
  lastName: string;
  avatarKind: 'uploaded' | 'preset' | 'initials' | null;
  avatarPath: string | null;
  avatarPreset:
    | 'mountain'
    | 'volcano'
    | 'pine'
    | 'compass'
    | 'hiking'
    | 'sunrise'
    | 'forest'
    | 'summit'
    | null;
  memberRole: GroupVisitMemberRole;
  memberStatus: VisitMemberStatus;
  joinedAt: string;
  returnStartedAt: string | null;
  checkedOutAt: string | null;
};

export type GroupVisitDetails = {
  visitId: string;
  routeId: string;
  routeNameEs: string;
  routeNameEn: string;
  status: GroupVisitStatus;
  joinCode: string | null;
  visitType: VisitType;
  startMode: VisitStartMode;
  hasLocalGuide: boolean;
  guideName: string | null;
  plannedStartAt: string | null;
  startedAt: string | null;
  expectedReturnAt: string | null;
  completedAt: string | null;
  createdBy: string;
  participants: GroupVisitParticipant[];
};

export type CreateGroupVisitInput = {
  visitType: VisitType;
  startMode: VisitStartMode;
  plannedStartAt: string | null;
  expectedReturnAt: string;
  hasLocalGuide: boolean;
  guideName: string | null;
  recommendationsAccepted: boolean;
};

export type VisitHistoryItem = {
  visitId: string;
  visitDate: string;
  visitType: VisitType;
  visitStatus: GroupVisitStatus;
  routeNameEs: string;
  routeNameEn: string;
  memberRole: GroupVisitMemberRole;
  memberStatus: VisitMemberStatus;
  plannedStartAt: string | null;
  startedAt: string | null;
  expectedReturnAt: string | null;
  completedAt: string | null;
  returnStartedAt: string | null;
  checkedOutAt: string | null;
  participantCount: number;
  creationOrigin: 'tourist' | 'administrative';
  completionMethod: 'normal' | 'administrative' | 'pending';
};

export type VisitHistoryMember = {
  firstName: string;
  lastName: string;
  memberRole: GroupVisitMemberRole;
  memberStatus: VisitMemberStatus;
  checkedOutAt: string | null;
};
