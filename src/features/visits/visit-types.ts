export type GroupVisitStatus =
  'forming' | 'in_progress' | 'completed' | 'cancelled';

export type GroupVisitMemberRole = 'leader' | 'member';

export type VisitType = 'day_hike' | 'expedition_camping';

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
  hasLocalGuide: boolean;
  guideName: string | null;
  startedAt: string | null;
  expectedReturnAt: string | null;
  completedAt: string | null;
  createdBy: string;
  participants: GroupVisitParticipant[];
};

export type CreateGroupVisitInput = {
  visitType: VisitType;
  expectedReturnAt: string;
  hasLocalGuide: boolean;
  guideName: string | null;
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
  startedAt: string | null;
  expectedReturnAt: string | null;
  completedAt: string | null;
  returnStartedAt: string | null;
  checkedOutAt: string | null;
  participantCount: number;
};
