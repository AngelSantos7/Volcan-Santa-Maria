export type AnnouncementType = 'info' | 'environmental' | 'warning' | 'event';

export type Announcement = {
  id: string;
  titleEs: string | null;
  titleEn: string | null;
  messageEs: string;
  messageEn: string | null;
  type: AnnouncementType;
  priority: number;
  dismissible: boolean;
};

export type AnnouncementPlacement = 'login' | 'createAscent';
