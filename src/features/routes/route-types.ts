export type RouteCheckpointType =
  'start' | 'reference' | 'rest' | 'viewpoint' | 'summit';

export type RouteTab = 'information' | 'map' | 'references' | 'photos';

export type RouteCheckpoint = {
  id: string;
  sequence: number;
  checkpointType: RouteCheckpointType | null;
  nameEs: string;
  nameEn: string;
  descriptionEs: string | null;
  descriptionEn: string | null;
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
};

export type RouteMedia = {
  id: string;
  checkpointId: string | null;
  storagePath: string;
  publicUrl: string;
  captionEs: string | null;
  captionEn: string | null;
  sortOrder: number;
  isCover: boolean;
};

export type RouteContent = {
  id: string;
  slug: string;
  nameEs: string;
  nameEn: string;
  descriptionEs: string | null;
  descriptionEn: string | null;
  difficulty: string | null;
  distanceKm: number | null;
  estimatedDurationMinutes: number | null;
  elevationGainM: number | null;
  pathGeojson: Record<string, unknown> | null;
  checkpoints: RouteCheckpoint[];
  media: RouteMedia[];
  mediaLoadFailed: boolean;
};
