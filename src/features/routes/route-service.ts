import { supabase } from '../../lib/supabase';
import type {
  RouteCheckpoint,
  RouteCheckpointType,
  RouteContent,
  RouteMedia,
} from './route-types';

const SUMMIT_ROUTE_SLUG = 'ascenso-a-la-cima';
const ROUTE_MEDIA_BUCKET = 'route-media';
const ROUTE_CACHE_KEY = `route-content:v2:${SUMMIT_ROUTE_SLUG}`;

type RouteRow = {
  id: string;
  slug: string;
  name_es: string;
  name_en: string;
  description_es: string | null;
  description_en: string | null;
  difficulty: string | null;
  distance_km: number | null;
  estimated_duration_minutes: number | null;
  elevation_gain_m: number | null;
  path_geojson: Record<string, unknown> | null;
};

type CheckpointRow = {
  id: string;
  sequence: number;
  checkpoint_type: RouteCheckpointType | null;
  name_es: string;
  name_en: string;
  description_es: string | null;
  description_en: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
};

type MediaRow = {
  id: string;
  checkpoint_id: string | null;
  storage_path: string;
  caption_es: string | null;
  caption_en: string | null;
  sort_order: number;
  is_cover: boolean;
};

function mapCheckpoint(row: CheckpointRow): RouteCheckpoint {
  return {
    id: row.id,
    sequence: row.sequence,
    checkpointType: row.checkpoint_type,
    nameEs: row.name_es,
    nameEn: row.name_en,
    descriptionEs: row.description_es,
    descriptionEn: row.description_en,
    latitude: row.latitude,
    longitude: row.longitude,
    altitudeM: row.altitude_m,
  };
}

function mapMedia(row: MediaRow): RouteMedia {
  const { data } = supabase.storage
    .from(ROUTE_MEDIA_BUCKET)
    .getPublicUrl(row.storage_path.replace(/^\/+/, ''));

  return {
    id: row.id,
    checkpointId: row.checkpoint_id,
    storagePath: row.storage_path,
    publicUrl: data.publicUrl,
    captionEs: row.caption_es,
    captionEn: row.caption_en,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
  };
}

function cacheRouteContent(content: RouteContent): void {
  try {
    window.localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(content));
  } catch {
    // Route data remains available for the current session when storage is full
    // or disabled by the browser.
  }
}

export function getCachedSummitRouteContent(): RouteContent | null {
  try {
    const cached = window.localStorage.getItem(ROUTE_CACHE_KEY);
    if (!cached) return null;

    const parsed: unknown = JSON.parse(cached);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('slug' in parsed) ||
      parsed.slug !== SUMMIT_ROUTE_SLUG ||
      !('checkpoints' in parsed) ||
      !Array.isArray(parsed.checkpoints) ||
      !('media' in parsed) ||
      !Array.isArray(parsed.media)
    ) {
      return null;
    }

    return parsed as RouteContent;
  } catch {
    return null;
  }
}

export async function getSummitRouteContent(): Promise<RouteContent> {
  const { data: routeData, error: routeError } = await supabase
    .from('routes')
    .select(
      'id, slug, name_es, name_en, description_es, description_en, difficulty, distance_km, estimated_duration_minutes, elevation_gain_m, path_geojson'
    )
    .eq('slug', SUMMIT_ROUTE_SLUG)
    .eq('is_active', true)
    .maybeSingle();

  if (routeError) throw routeError;
  if (!routeData) throw new Error('Active summit route was not returned');

  const route = routeData as RouteRow;
  const [checkpointResult, mediaResult] = await Promise.all([
    supabase
      .from('route_checkpoints')
      .select(
        'id, sequence, checkpoint_type, name_es, name_en, description_es, description_en, latitude, longitude, altitude_m'
      )
      .eq('route_id', route.id)
      .order('sequence', { ascending: true }),
    supabase
      .from('route_media')
      .select(
        'id, checkpoint_id, storage_path, caption_es, caption_en, sort_order, is_cover'
      )
      .eq('route_id', route.id)
      .order('sort_order', { ascending: true }),
  ]);

  if (checkpointResult.error) throw checkpointResult.error;

  const cachedContent = mediaResult.error
    ? getCachedSummitRouteContent()
    : null;
  const media = mediaResult.error
    ? cachedContent?.id === route.id
      ? cachedContent.media
      : []
    : ((mediaResult.data ?? []) as MediaRow[]).map(mapMedia);

  const content: RouteContent = {
    id: route.id,
    slug: route.slug,
    nameEs: route.name_es,
    nameEn: route.name_en,
    descriptionEs: route.description_es,
    descriptionEn: route.description_en,
    difficulty: route.difficulty,
    distanceKm: route.distance_km,
    estimatedDurationMinutes: route.estimated_duration_minutes,
    elevationGainM: route.elevation_gain_m,
    pathGeojson: route.path_geojson,
    checkpoints: ((checkpointResult.data ?? []) as CheckpointRow[]).map(
      mapCheckpoint
    ),
    media,
    mediaLoadFailed: mediaResult.error !== null,
  };

  if (!mediaResult.error) cacheRouteContent(content);
  return content;
}
