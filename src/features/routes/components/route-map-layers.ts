import type { GeoJSON, Position } from 'geojson';
import type { GeoJSONSource, Map } from 'maplibre-gl';

export type RouteOverlay = { id: string; slug: string; geojson: GeoJSON; active: boolean };
const PREFIX = 'hiking-route-';

export function routeLineCoordinates(geometry: GeoJSON): Position[] {
  switch (geometry.type) {
    case 'LineString': return geometry.coordinates;
    case 'MultiLineString': return geometry.coordinates.flat();
    case 'Feature': return geometry.geometry ? routeLineCoordinates(geometry.geometry) : [];
    case 'FeatureCollection': return geometry.features.flatMap(routeLineCoordinates);
    case 'GeometryCollection': return geometry.geometries.flatMap(routeLineCoordinates);
    default: return [];
  }
}

export function routeBounds(routes: RouteOverlay[]): [[number, number], [number, number]] | null {
  const points = routes.flatMap((route) => routeLineCoordinates(route.geojson))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (!points.length) return null;
  return points.reduce<[[number, number], [number, number]]>((bounds, [lng, lat]) => [
    [Math.min(bounds[0][0], lng), Math.min(bounds[0][1], lat)],
    [Math.max(bounds[1][0], lng), Math.max(bounds[1][1], lat)],
  ], [[Infinity, Infinity], [-Infinity, -Infinity]]);
}

// Alternative first, active last: overlapping sections prioritize the chosen hike.
// Called after every style load, because MapLibre replaces custom layers then.
export function syncRouteLayers(map: Map, routes: RouteOverlay[], baseMap: 'map' | 'satellite'): void {
  const sources = new Set(routes.map((route) => `${PREFIX}${route.id}`));
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.id.startsWith(PREFIX) && !sources.has(layer.id.replace(/-(line|casing)$/, ''))) map.removeLayer(layer.id);
  }
  for (const sourceId of Object.keys(map.getStyle().sources)) {
    if (sourceId.startsWith(PREFIX) && !sources.has(sourceId)) map.removeSource(sourceId);
  }
  for (const route of [...routes].sort((a, b) => Number(a.active) - Number(b.active))) {
    const sourceId = `${PREFIX}${route.id}`;
    const source = map.getSource<GeoJSONSource>(sourceId);
    if (source) void source.setData(route.geojson);
    else map.addSource(sourceId, { type: 'geojson', data: route.geojson });
    const satellite = baseMap === 'satellite';
    const color = route.active ? (satellite ? '#78f0bd' : '#116149') : '#8c969c';
    for (const kind of ['casing', 'line'] as const) {
      const id = `${sourceId}-${kind}`;
      const casing = kind === 'casing';
      const paint = {
        'line-color': casing ? (satellite ? '#15251f' : '#f5fff9') : color,
        'line-width': (route.active ? 5.5 : 3.5) + (casing ? 3 : 0),
        'line-opacity': route.active ? 1 : 0.85,
        'line-dasharray': route.active ? [1, 0] : [2, 2],
      };
      if (!map.getLayer(id)) map.addLayer({ id, type: 'line', source: sourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint });
      else {
        map.setPaintProperty(id, 'line-color', paint['line-color']);
        map.setPaintProperty(id, 'line-width', paint['line-width']);
        map.setPaintProperty(id, 'line-opacity', paint['line-opacity']);
        map.setPaintProperty(id, 'line-dasharray', paint['line-dasharray']);
      }
      map.moveLayer(id);
    }
  }
}
