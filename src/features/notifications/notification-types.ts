export type NotificationPriority = 'info' | 'caution' | 'urgent';

export type AppNotification = {
  id: string;
  titleEs: string;
  bodyEs: string;
  titleEn: string | null;
  bodyEn: string | null;
  priority: NotificationPriority;
  imageUrl: string | null;
  destinationUrl: string;
  publishedAt: string;
  expiresAt: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  snoozedUntil: string | null;
  snoozeCount: number;
};
