import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSON } from 'geojson';
import {
  type GeoJSONSource,
  Map,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../../i18n';
import type { RouteCheckpoint, RouteContent } from '../route-types';
import { CheckpointMediaGallery } from './CheckpointMediaGallery';

setWorkerUrl(mapLibreWorkerUrl);

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY?.trim() || null;
const SATELLITE_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/hybrid-v4/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`
  : null;
const DEFAULT_BASE_MAP = SATELLITE_STYLE_URL ? 'satellite' : 'map';
const DEFAULT_STYLE_URL = SATELLITE_STYLE_URL ?? MAP_STYLE_URL;
const ROUTE_SOURCE_ID = 'summit-route-path';
const ROUTE_CASING_LAYER_ID = 'summit-route-path-casing';
const ROUTE_LAYER_ID = 'summit-route-path-line';
const ACCURACY_SOURCE_ID = 'user-location-accuracy';
const ACCURACY_FILL_LAYER_ID = 'user-location-accuracy-fill';
const ACCURACY_LINE_LAYER_ID = 'user-location-accuracy-line';
const VOLCANO_CENTER: [number, number] = [-91.552, 14.757];
const INITIAL_ZOOM = 13;
const VOLCANO_ALTITUDE_M = 3745;

type MapSelection =
  | { kind: 'start' }
  | { kind: 'summit' }
  | { kind: 'checkpoint'; checkpointId: string }
  | null;

type RouteMapProps = {
  route: RouteContent;
};

type BaseMap = 'map' | 'satellite';
type LivePosition = { longitude: number; latitude: number; accuracy: number };

function createAccuracyCircle(position: LivePosition): GeoJSON {
  const points = 64;
  const latitudeRadians = (position.latitude * Math.PI) / 180;
  const latitudeDegrees = position.accuracy / 111_320;
  const longitudeDegrees =
    position.accuracy / (111_320 * Math.max(Math.cos(latitudeRadians), 0.01));
  const coordinates = Array.from({ length: points + 1 }, (_, index) => {
    const angle = (index / points) * Math.PI * 2;
    return [
      position.longitude + Math.cos(angle) * longitudeDegrees,
      position.latitude + Math.sin(angle) * latitudeDegrees,
    ];
  });
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  };
}

function syncAccuracyLayer(map: Map, accuracyGeoJson: GeoJSON | null): void {
  if (!accuracyGeoJson) return;
  const source = map.getSource<GeoJSONSource>(ACCURACY_SOURCE_ID);
  if (source) void source.setData(accuracyGeoJson);
  else
    map.addSource(ACCURACY_SOURCE_ID, {
      type: 'geojson',
      data: accuracyGeoJson,
    });
  if (!map.getLayer(ACCURACY_FILL_LAYER_ID))
    map.addLayer({
      id: ACCURACY_FILL_LAYER_ID,
      type: 'fill',
      source: ACCURACY_SOURCE_ID,
      paint: { 'fill-color': '#2d9cdb', 'fill-opacity': 0.16 },
    });
  if (!map.getLayer(ACCURACY_LINE_LAYER_ID))
    map.addLayer({
      id: ACCURACY_LINE_LAYER_ID,
      type: 'line',
      source: ACCURACY_SOURCE_ID,
      paint: { 'line-color': '#1685c1', 'line-width': 2, 'line-opacity': 0.75 },
    });
}

function hasLineGeometry(geoJson: GeoJSON): boolean {
  switch (geoJson.type) {
    case 'LineString':
    case 'MultiLineString':
      return true;
    case 'Feature':
      return geoJson.geometry ? hasLineGeometry(geoJson.geometry) : false;
    case 'FeatureCollection':
      return geoJson.features.some(hasLineGeometry);
    case 'GeometryCollection':
      return geoJson.geometries.some(hasLineGeometry);
    default:
      return false;
  }
}

function getRouteGeoJson(
  value: Record<string, unknown> | null
): GeoJSON | null {
  if (!value || typeof value.type !== 'string') return null;

  const geoJson = value as unknown as GeoJSON;
  return hasLineGeometry(geoJson) ? geoJson : null;
}

function getLocalizedCheckpoint(
  checkpoint: RouteCheckpoint,
  language: 'es' | 'en'
) {
  return {
    name: language === 'es' ? checkpoint.nameEs : checkpoint.nameEn,
    description:
      language === 'es' ? checkpoint.descriptionEs : checkpoint.descriptionEn,
  };
}

function removeRouteLayers(map: Map): void {
  if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
  if (map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.removeLayer(ROUTE_CASING_LAYER_ID);
  }
  if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
}

function syncRouteLayers(
  map: Map,
  routeGeoJson: GeoJSON | null,
  baseMap: BaseMap
): void {
  if (!routeGeoJson) {
    removeRouteLayers(map);
    return;
  }

  const existingSource = map.getSource<GeoJSONSource>(ROUTE_SOURCE_ID);
  if (existingSource) {
    void existingSource.setData(routeGeoJson);
  } else {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: routeGeoJson,
    });
  }

  const isSatellite = baseMap === 'satellite';
  const casingColor = isSatellite ? '#08251c' : '#f5fff9';
  const routeColor = isSatellite ? '#78f0bd' : '#116149';

  if (!map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': casingColor,
        'line-opacity': 0.88,
        'line-width': isSatellite ? 9 : 8,
      },
    });
  }

  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': routeColor,
        'line-opacity': 0.96,
        'line-width': isSatellite ? 5.5 : 5,
      },
    });
  }

  map.setPaintProperty(ROUTE_CASING_LAYER_ID, 'line-color', casingColor);
  map.setPaintProperty(
    ROUTE_CASING_LAYER_ID,
    'line-width',
    isSatellite ? 9 : 8
  );
  map.setPaintProperty(ROUTE_LAYER_ID, 'line-color', routeColor);
  map.setPaintProperty(ROUTE_LAYER_ID, 'line-width', isSatellite ? 5.5 : 5);
}

export function RouteMap({ route }: RouteMapProps) {
  const { t, i18n } = useTranslation();
  const language = getAppLanguage(i18n.resolvedLanguage);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMap>(DEFAULT_BASE_MAP);
  const [styleSwitching, setStyleSwitching] = useState(false);
  const [satelliteLoadFailed, setSatelliteLoadFailed] = useState(false);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'locating' | 'active' | 'error'
  >('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [livePosition, setLivePosition] = useState<LivePosition | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const latestPositionRef = useRef<LivePosition | null>(null);
  const accuracyGeoJsonRef = useRef<GeoJSON | null>(null);
  const centerOnFirstPositionRef = useRef(true);
  const [failedMediaIds, setFailedMediaIds] = useState<Set<string>>(
    () => new Set()
  );

  const locatedCheckpoints = useMemo(
    () =>
      route.checkpoints.filter(
        (checkpoint) =>
          checkpoint.latitude !== null && checkpoint.longitude !== null
      ),
    [route.checkpoints]
  );
  const routeGeoJson = useMemo(
    () => getRouteGeoJson(route.pathGeojson),
    [route.pathGeojson]
  );
  const routeGeoJsonRef = useRef(routeGeoJson);
  const baseMapRef = useRef<BaseMap>(DEFAULT_BASE_MAP);
  const pendingBaseMapRef = useRef<BaseMap | null>(null);
  const fallbackInProgressRef = useRef(false);
  const selectedCheckpoint =
    selection?.kind === 'checkpoint'
      ? (locatedCheckpoints.find(
          (checkpoint) => checkpoint.id === selection.checkpointId
        ) ?? null)
      : null;
  const selectedCheckpointMedia = useMemo(() => {
    if (!selectedCheckpoint) return [];

    return route.media
      .filter(
        (media) =>
          media.checkpointId === selectedCheckpoint.id &&
          !failedMediaIds.has(media.id)
      )
      .toSorted(
        (first, second) =>
          Number(second.isCover) - Number(first.isCover) ||
          first.sortOrder - second.sortOrder
      );
  }, [failedMediaIds, route.media, selectedCheckpoint]);

  useEffect(() => {
    if (!containerRef.current) return;

    let loaded = false;
    let active = true;
    let map: Map | null = null;

    try {
      baseMapRef.current = DEFAULT_BASE_MAP;
      pendingBaseMapRef.current =
        DEFAULT_BASE_MAP === 'satellite' ? 'satellite' : null;
      map = new Map({
        container: containerRef.current,
        style: DEFAULT_STYLE_URL,
        center: VOLCANO_CENTER,
        zoom: INITIAL_ZOOM,
        dragPan: true,
        touchZoomRotate: true,
      });
      mapRef.current = map;

      map.addControl(
        new NavigationControl({ showCompass: false, showZoom: true }),
        'top-right'
      );
      map.addControl(
        new ScaleControl({ maxWidth: 100, unit: 'metric' }),
        'bottom-left'
      );

      map.on('style.load', () => {
        if (!map) return;

        const appliedBaseMap = pendingBaseMapRef.current ?? baseMapRef.current;
        baseMapRef.current = appliedBaseMap;
        syncRouteLayers(map, routeGeoJsonRef.current, appliedBaseMap);
        syncAccuracyLayer(map, accuracyGeoJsonRef.current);

        if (fallbackInProgressRef.current && appliedBaseMap === 'map') {
          fallbackInProgressRef.current = false;
        }

        if (pendingBaseMapRef.current) {
          pendingBaseMapRef.current = null;
          setBaseMap(appliedBaseMap);
          setStyleSwitching(false);
          setSatelliteLoadFailed(false);
        }
      });
      map.on('load', () => {
        if (!map) return;
        loaded = true;
        syncRouteLayers(map, routeGeoJsonRef.current, baseMapRef.current);
        setMapLoaded(true);
        setMapFailed(false);
      });
      map.on('error', () => {
        const pendingBaseMap = pendingBaseMapRef.current;
        if (pendingBaseMap) {
          pendingBaseMapRef.current = null;
          setStyleSwitching(false);

          if (pendingBaseMap === 'satellite' && map) {
            baseMapRef.current = 'map';
            fallbackInProgressRef.current = true;
            setBaseMap('map');
            setSatelliteLoadFailed(true);
            try {
              map.setStyle(MAP_STYLE_URL);
            } catch {
              fallbackInProgressRef.current = false;
              setMapFailed(true);
            }
            return;
          }
        }

        if (!loaded && !fallbackInProgressRef.current) {
          setMapFailed(true);
          setMapLoaded(false);
        }
      });
    } catch {
      queueMicrotask(() => {
        if (!active) return;
        setMapFailed(true);
        setMapLoaded(false);
      });
    }

    return () => {
      active = false;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      latestPositionRef.current = null;
      accuracyGeoJsonRef.current = null;
      centerOnFirstPositionRef.current = true;
      mapRef.current = null;
      fallbackInProgressRef.current = false;
      map?.remove();
    };
  }, [mapAttempt]);

  useEffect(() => {
    routeGeoJsonRef.current = routeGeoJson;
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    syncRouteLayers(map, routeGeoJson, baseMapRef.current);
  }, [mapLoaded, routeGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const markers: Marker[] = [];
    const summitButton = document.createElement('button');
    summitButton.type = 'button';
    summitButton.className = 'route-map-marker route-map-summit-marker';
    summitButton.setAttribute('aria-label', t('routes.map.summitMarkerLabel'));
    const summitIcon = document.createElement('span');
    summitIcon.textContent = '▲';
    summitButton.append(summitIcon);
    summitButton.addEventListener('click', () => {
      setSelection({ kind: 'summit' });
    });
    markers.push(
      new Marker({ element: summitButton, anchor: 'bottom' })
        .setLngLat(route.summitCoordinate ?? VOLCANO_CENTER)
        .addTo(map)
    );
    if (route.startCoordinate) {
      const startButton = document.createElement('button');
      startButton.type = 'button';
      startButton.className = 'route-map-marker route-start-marker';
      startButton.setAttribute('aria-label', t('routes.map.startMarkerLabel'));
      startButton.textContent = '●';
      startButton.addEventListener('click', () =>
        setSelection({ kind: 'start' })
      );
      markers.push(
        new Marker({ element: startButton, anchor: 'bottom' })
          .setLngLat(route.startCoordinate)
          .addTo(map)
      );
    }

    locatedCheckpoints.forEach((checkpoint) => {
      if (checkpoint.latitude === null || checkpoint.longitude === null) return;

      const { name } = getLocalizedCheckpoint(checkpoint, language);
      const checkpointButton = document.createElement('button');
      checkpointButton.type = 'button';
      checkpointButton.className =
        'route-map-marker route-map-checkpoint-marker';
      checkpointButton.setAttribute(
        'aria-label',
        t('routes.map.checkpointMarkerLabel', { name })
      );
      const checkpointLabel = document.createElement('span');
      checkpointLabel.textContent = String(checkpoint.sequence);
      checkpointButton.append(checkpointLabel);
      checkpointButton.addEventListener('click', () => {
        setSelection({ kind: 'checkpoint', checkpointId: checkpoint.id });
      });

      markers.push(
        new Marker({ element: checkpointButton, anchor: 'bottom' })
          .setLngLat([checkpoint.longitude, checkpoint.latitude])
          .addTo(map)
      );
    });

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [
    language,
    locatedCheckpoints,
    mapLoaded,
    route.startCoordinate,
    route.summitCoordinate,
    t,
  ]);

  const recenterMap = () => {
    mapRef.current?.easeTo({
      center: VOLCANO_CENTER,
      zoom: INITIAL_ZOOM,
      duration: 700,
    });
  };

  const centerOnPosition = (position: LivePosition) => {
    mapRef.current?.easeTo({
      center: [position.longitude, position.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      duration: 700,
    });
  };

  const activateLocation = () => {
    const currentPosition = latestPositionRef.current;
    if (watchIdRef.current !== null) {
      if (currentPosition) centerOnPosition(currentPosition);
      return;
    }
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationStatus('error');
      setLocationError(t('routes.map.locationUnavailable'));
      return;
    }
    setLocationStatus('locating');
    setLocationError(null);
    centerOnFirstPositionRef.current = true;
    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const position = {
          longitude: coords.longitude,
          latitude: coords.latitude,
          accuracy: coords.accuracy,
        };
        latestPositionRef.current = position;
        const accuracyGeoJson = createAccuracyCircle(position);
        accuracyGeoJsonRef.current = accuracyGeoJson;
        setLivePosition(position);
        setLocationStatus('active');
        setLocationError(null);
        const map = mapRef.current;
        if (!map) return;
        if (!userMarkerRef.current) {
          const markerElement = document.createElement('div');
          markerElement.className = 'route-user-location-marker';
          markerElement.setAttribute('role', 'img');
          markerElement.setAttribute('aria-label', t('routes.map.youAreHere'));
          markerElement.title = t('routes.map.youAreHere');
          userMarkerRef.current = new Marker({ element: markerElement })
            .setLngLat([position.longitude, position.latitude])
            .addTo(map);
        } else
          userMarkerRef.current.setLngLat([
            position.longitude,
            position.latitude,
          ]);
        if (map.isStyleLoaded()) syncAccuracyLayer(map, accuracyGeoJson);
        if (centerOnFirstPositionRef.current) {
          centerOnFirstPositionRef.current = false;
          centerOnPosition(position);
        }
      },
      (error) => {
        setLocationStatus('error');
        const key =
          error.code === error.PERMISSION_DENIED
            ? 'permissionDenied'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'positionUnavailable'
              : 'timeout';
        setLocationError(t(`routes.map.locationErrors.${key}`));
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );
  };

  const changeBaseMap = (nextBaseMap: BaseMap) => {
    if (
      nextBaseMap === baseMap ||
      styleSwitching ||
      (nextBaseMap === 'satellite' && !SATELLITE_STYLE_URL)
    ) {
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    const nextStyle =
      nextBaseMap === 'satellite' ? SATELLITE_STYLE_URL : MAP_STYLE_URL;
    if (!nextStyle) return;

    pendingBaseMapRef.current = nextBaseMap;
    setBaseMap(nextBaseMap);
    setStyleSwitching(true);
    setSatelliteLoadFailed(false);

    try {
      map.setStyle(nextStyle);
    } catch {
      pendingBaseMapRef.current = null;
      baseMapRef.current = 'map';
      fallbackInProgressRef.current = true;
      setBaseMap('map');
      setStyleSwitching(false);
      setSatelliteLoadFailed(nextBaseMap === 'satellite');
      try {
        map.setStyle(MAP_STYLE_URL);
      } catch {
        fallbackInProgressRef.current = false;
        setMapFailed(true);
      }
    }
  };

  const retryMap = () => {
    setMapFailed(false);
    setMapLoaded(false);
    setMapAttempt((attempt) => attempt + 1);
  };

  const hideFailedMedia = (mediaId: string) => {
    setFailedMediaIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(mediaId);
      return nextIds;
    });
  };

  const localizedCheckpoint = selectedCheckpoint
    ? getLocalizedCheckpoint(selectedCheckpoint, language)
    : null;

  return (
    <div className="route-map-section">
      <div className="route-map-frame">
        <div
          ref={containerRef}
          className="route-map-canvas"
          role="region"
          aria-label={t('routes.map.mapLabel')}
        />

        {mapLoaded && (
          <p className="route-map-loaded-status" aria-live="polite">
            {t('routes.map.loaded')}
          </p>
        )}

        {!mapLoaded && !mapFailed && (
          <div className="route-map-state" role="status">
            {t('routes.map.loading')}
          </div>
        )}

        {mapFailed && (
          <div className="route-map-state route-map-error" role="alert">
            <p>{t('routes.map.loadError')}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={retryMap}
            >
              {t('profile.retry')}
            </button>
          </div>
        )}

        {mapLoaded && (
          <div
            className="route-map-basemap-switcher"
            role="group"
            aria-label={t('routes.map.baseMapControl')}
            aria-busy={styleSwitching}
          >
            <button
              type="button"
              aria-pressed={baseMap === 'map'}
              onClick={() => changeBaseMap('map')}
              disabled={styleSwitching}
            >
              {t('routes.map.mapBase')}
            </button>
            <button
              type="button"
              aria-pressed={baseMap === 'satellite'}
              onClick={() => changeBaseMap('satellite')}
              disabled={!SATELLITE_STYLE_URL || styleSwitching}
              title={
                SATELLITE_STYLE_URL
                  ? undefined
                  : t('routes.map.satelliteUnavailable')
              }
            >
              {t('routes.map.satelliteBase')}
            </button>
          </div>
        )}

        {mapLoaded && (
          <button
            className="route-map-recenter"
            type="button"
            onClick={recenterMap}
            title={t('routes.map.recenter')}
            aria-label={t('routes.map.recenter')}
          >
            <span aria-hidden="true">⌖</span>
          </button>
        )}

        {mapLoaded && (
          <button
            className="route-map-my-location"
            type="button"
            onClick={activateLocation}
            disabled={locationStatus === 'locating'}
          >
            <span aria-hidden="true">●</span>
            {t('routes.map.myLocation')}
          </button>
        )}

        {selection && mapLoaded && (
          <aside
            className="route-map-details"
            aria-label={t('routes.map.selectedPoint')}
          >
            <button
              className="route-map-details-close"
              type="button"
              onClick={() => setSelection(null)}
              aria-label={t('routes.map.closeDetails')}
            >
              ×
            </button>

            {selection.kind === 'summit' && (
              <>
                <span className="route-checkpoint-type">
                  {t('routes.map.volcanoReference')}
                </span>
                <h3>
                  {language === 'es'
                    ? 'Volcán Santa María'
                    : 'Santa María Volcano'}
                </h3>
                <span className="route-checkpoint-altitude">
                  {t('routes.altitude', { altitude: VOLCANO_ALTITUDE_M })}
                </span>
              </>
            )}
            {selection.kind === 'start' && (
              <>
                <span className="route-checkpoint-type">
                  {t('routes.map.routeStart')}
                </span>
                <h3>{t('routes.map.startMarkerLabel')}</h3>
              </>
            )}

            {selection.kind === 'checkpoint' &&
              selectedCheckpoint &&
              localizedCheckpoint && (
                <>
                  {selectedCheckpoint.checkpointType && (
                    <span className="route-checkpoint-type">
                      {t(
                        `routes.checkpointTypes.${selectedCheckpoint.checkpointType}`
                      )}
                    </span>
                  )}
                  <h3>{localizedCheckpoint.name}</h3>
                  {localizedCheckpoint.description && (
                    <p>{localizedCheckpoint.description}</p>
                  )}
                  {selectedCheckpoint.altitudeM !== null && (
                    <span className="route-checkpoint-altitude">
                      {t('routes.altitude', {
                        altitude: selectedCheckpoint.altitudeM,
                      })}
                    </span>
                  )}

                  <CheckpointMediaGallery
                    key={selectedCheckpoint.id}
                    media={selectedCheckpointMedia}
                    fallbackAlt={localizedCheckpoint.name}
                    language={language}
                    onMediaError={hideFailedMedia}
                    compact
                  />
                </>
              )}
          </aside>
        )}
      </div>

      <div className="route-location-status" aria-live="polite">
        {locationStatus === 'locating' && <p>{t('routes.map.locating')}</p>}
        {livePosition && (
          <p>
            {t('routes.map.accuracy', {
              accuracy: Math.round(livePosition.accuracy),
            })}
          </p>
        )}
        {locationError && (
          <p className="route-location-error">{locationError}</p>
        )}
        <small>{t('routes.map.locationPrivacy')}</small>
      </div>

      <section className="route-stats-card">
        <h3>{t('routes.stats.title')}</h3>
        <div>
          <strong>{route.distanceKm?.toFixed(1) ?? '6.1'} km</strong>
          <span>{t('routes.stats.distance')}</span>
        </div>
        <div>
          <strong>+{Math.round(route.elevationGainM ?? 934)} m</strong>
          <span>{t('routes.stats.gain')}</span>
        </div>
        <div>
          <strong>
            {Math.floor((route.estimatedDurationMinutes ?? 185) / 60)} h{' '}
            {String((route.estimatedDurationMinutes ?? 185) % 60).padStart(
              2,
              '0'
            )}{' '}
            min
          </strong>
          <span>{t('routes.stats.time')}</span>
        </div>
        <p>{t('routes.stats.disclaimer')}</p>
      </section>
      <details className="santiaguito-warning">
        <summary>{t('routes.santiaguito.title')}</summary>
        <p>{t('routes.santiaguito.body')}</p>
        <small>{t('routes.santiaguito.source')}</small>
      </details>

      {!routeGeoJson && (
        <p className="route-map-note">{t('routes.map.trackPending')}</p>
      )}
      {locatedCheckpoints.length === 0 && (
        <p className="route-map-note">{t('routes.map.noCheckpoints')}</p>
      )}
      {route.mediaLoadFailed && (
        <p className="route-map-note" role="status">
          {t('routes.map.mediaLoadError')}
        </p>
      )}
      {satelliteLoadFailed && (
        <p className="route-map-note" role="status">
          {t('routes.map.satelliteLoadError')}
        </p>
      )}
    </div>
  );
}
