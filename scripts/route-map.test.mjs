import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { routeBounds, routeLineCoordinates, syncRouteLayers } from '../src/features/routes/components/route-map-layers.ts';

const summit = JSON.parse(await readFile(new URL('../public/data/santa-maria-route.geojson', import.meta.url), 'utf8'));
const picacho = JSON.parse(await readFile(new URL('../public/data/mirador-picacho-route.geojson', import.meta.url), 'utf8'));
const overlays = (active) => [
  { id: 'summit', slug: 'ascenso-a-la-cima', geojson: summit, active: active === 'summit' },
  { id: 'picacho', slug: 'mirador-picacho', geojson: picacho, active: active === 'picacho' },
];
function mapMock() {
  const sources = {};
  const layers = [];
  return {
    sources, layers,
    getStyle: () => ({ sources, layers: [...layers] }),
    getSource: (id) => sources[id],
    addSource(id, input) { sources[id] = { data: input.data, setData(data) { this.data = data; } }; },
    removeSource(id) { delete sources[id]; },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    addLayer(layer) { layers.push(layer); },
    removeLayer(id) { layers.splice(layers.findIndex((layer) => layer.id === id), 1); },
    setPaintProperty(id, key, value) { this.getLayer(id).paint[key] = value; },
    moveLayer(id) { const layer = this.getLayer(id); this.removeLayer(id); layers.push(layer); },
  };
}

test('both real GPX paths fit the same viewport without a fictitious Picacho return', () => {
  const bounds = routeBounds(overlays('summit'));
  assert.equal(routeLineCoordinates(summit).length, 1935);
  assert.equal(routeLineCoordinates(picacho).length, 858);
  for (const [lng, lat] of [...routeLineCoordinates(summit), ...routeLineCoordinates(picacho)]) {
    assert.ok(lng >= bounds[0][0] && lng <= bounds[1][0]);
    assert.ok(lat >= bounds[0][1] && lat <= bounds[1][1]);
  }
  assert.ok(bounds[1][0] - bounds[0][0] < 0.1);
  assert.ok(bounds[1][1] - bounds[0][1] < 0.1);
});

test('active route switches green and grey without losing either path', () => {
  const map = mapMock();
  syncRouteLayers(map, overlays('summit'), 'satellite');
  assert.equal(Object.keys(map.sources).length, 2);
  assert.equal(map.getLayer('hiking-route-summit-line').paint['line-color'], '#78f0bd');
  assert.equal(map.getLayer('hiking-route-picacho-line').paint['line-color'], '#8c969c');
  syncRouteLayers(map, overlays('picacho'), 'satellite');
  assert.equal(map.getLayer('hiking-route-picacho-line').paint['line-color'], '#78f0bd');
  assert.equal(map.getLayer('hiking-route-summit-line').paint['line-color'], '#8c969c');
  assert.equal(map.layers.at(-1).id, 'hiking-route-picacho-line');
  assert.deepEqual(map.getLayer('hiking-route-picacho-line').paint['line-dasharray'], [1, 0]);
  assert.deepEqual(map.getLayer('hiking-route-summit-line').paint['line-dasharray'], [2, 2]);
  assert.equal(map.sources['hiking-route-picacho'].data, picacho);
  assert.equal(map.sources['hiking-route-summit'].data, summit);
});

test('style reload restores both routes and repeated sync does not duplicate layers', () => {
  const map = mapMock();
  syncRouteLayers(map, overlays('picacho'), 'map');
  syncRouteLayers(map, overlays('picacho'), 'map');
  assert.equal(map.layers.length, 4);
  for (const key of Object.keys(map.sources)) delete map.sources[key];
  map.layers.length = 0;
  syncRouteLayers(map, overlays('picacho'), 'satellite');
  assert.equal(map.layers.length, 4);
  assert.equal(Object.keys(map.sources).length, 2);
  assert.ok(map.getLayer('hiking-route-picacho-line').paint['line-width'] > map.getLayer('hiking-route-summit-line').paint['line-width']);
});
