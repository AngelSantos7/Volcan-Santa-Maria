export type RouteCheckpointType =
  'start' | 'reference' | 'rest' | 'viewpoint' | 'summit';

export type RouteTab =
  | 'recommendations'
  | 'map'
  | 'weather'
  | 'gallery'
  | 'donations';

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
  titleEs: string | null;
  titleEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
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
  startCoordinate: [number, number] | null;
  summitCoordinate: [number, number] | null;
};
