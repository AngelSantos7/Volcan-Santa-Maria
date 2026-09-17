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
import type { RouteCheckpoint, RouteContent, RouteMedia } from '../route-types';

setWorkerUrl(mapLibreWorkerUrl);

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY?.trim() || null;
const SATELLITE_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/hybrid-v4/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`
  : null;
const ROUTE_SOURCE_ID = 'summit-route-path';
const ROUTE_CASING_LAYER_ID = 'summit-route-path-casing';
const ROUTE_LAYER_ID = 'summit-route-path-line';
const VOLCANO_CENTER: [number, number] = [-91.552, 14.757];
const INITIAL_ZOOM = 13;
const VOLCANO_ALTITUDE_M = 3745;

type MapSelection =
  { kind: 'summit' } | { kind: 'checkpoint'; checkpointId: string } | null;

type RouteMapProps = {
  route: RouteContent;
};

type BaseMap = 'map' | 'satellite';

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

function getLocalizedCaption(media: RouteMedia, language: 'es' | 'en') {
  return language === 'es' ? media.captionEs : media.captionEn;
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
  const [baseMap, setBaseMap] = useState<BaseMap>('map');
  const [styleSwitching, setStyleSwitching] = useState(false);
  const [satelliteLoadFailed, setSatelliteLoadFailed] = useState(false);
  const [selection, setSelection] = useState<MapSelection>(null);
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
  const baseMapRef = useRef<BaseMap>('map');
  const pendingBaseMapRef = useRef<BaseMap | null>(null);
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
      map = new Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
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
            setBaseMap('map');
            setSatelliteLoadFailed(true);
            try {
              map.setStyle(MAP_STYLE_URL);
            } catch {
              setMapFailed(true);
            }
            return;
          }
        }

        if (!loaded) {
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
      mapRef.current = null;
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
        .setLngLat(VOLCANO_CENTER)
        .addTo(map)
    );

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
  }, [language, locatedCheckpoints, mapLoaded, t]);

  const recenterMap = () => {
    mapRef.current?.easeTo({
      center: VOLCANO_CENTER,
      zoom: INITIAL_ZOOM,
      duration: 700,
    });
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
      setBaseMap('map');
      setStyleSwitching(false);
      setSatelliteLoadFailed(nextBaseMap === 'satellite');
      try {
        map.setStyle(MAP_STYLE_URL);
      } catch {
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

                  {selectedCheckpointMedia.length > 0 && (
                    <div className="route-map-gallery">
                      {selectedCheckpointMedia.map((media) => {
                        const caption = getLocalizedCaption(media, language);

                        return (
                          <figure key={media.id}>
                            <img
                              src={media.publicUrl}
                              alt={caption ?? localizedCheckpoint.name}
                              loading="lazy"
                              onError={() => hideFailedMedia(media.id)}
                            />
                            {caption && <figcaption>{caption}</figcaption>}
                          </figure>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
          </aside>
        )}
      </div>

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
