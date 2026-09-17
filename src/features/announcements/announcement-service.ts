import { supabase } from '../../lib/supabase';
import type {
  Announcement,
  AnnouncementPlacement,
  AnnouncementType,
} from './announcement-types';

type AnnouncementRow = {
  id: string;
  title_es: string | null;
  title_en: string | null;
  message_es: string;
  message_en: string | null;
  announcement_type: AnnouncementType;
  priority: number;
  dismissible: boolean;
};

export async function getAnnouncements(
  placement: AnnouncementPlacement
): Promise<Announcement[]> {
  const visibilityColumn =
    placement === 'login' ? 'show_on_login' : 'show_on_create_ascent';
  const { data, error } = await supabase
    .from('announcements')
    .select(
      'id, title_es, title_en, message_es, message_en, announcement_type, priority, dismissible'
    )
    .eq(visibilityColumn, true)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as AnnouncementRow[]).map((row) => ({
    id: row.id,
    titleEs: row.title_es,
    titleEn: row.title_en,
    messageEs: row.message_es,
    messageEn: row.message_en,
    type: row.announcement_type,
    priority: row.priority,
    dismissible: row.dismissible,
  }));
}
