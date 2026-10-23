import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const routes = [
  { slug: 'ascenso-a-la-cima', source: 'volcan-santa-maria.gpx', prefix: 'santa-maria-route', name: 'Cima del Volcán Santa María', roundTrip: true },
  { slug: 'mirador-picacho', source: 'mirador-picacho.gpx', prefix: 'mirador-picacho-route', name: 'Mirador Picacho', roundTrip: false },
];
const radians = (value) => value * Math.PI / 180;
function distance(a, b) {
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude))
    * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, h)));
}
async function artifact(path, value) {
  const target = new URL(`../${path}`, import.meta.url);
  const content = `${JSON.stringify(value, null, path.endsWith('geojson') ? 0 : 2)}\n`;
  if (process.argv.includes('--check')) assert.equal((await readFile(target, 'utf8')).replace(/\r\n/g, '\n'), content, `Regenerate ${path}`);
  else await writeFile(target, content);
}
for (const route of routes) {
  const xml = await readFile(new URL(`../public/data/${route.source}`, import.meta.url), 'utf8');
  assert.match(xml, /<gpx\b/);
  const segments = [...xml.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/g)].map((segment) =>
    [...segment[1].matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g)].map((point) => ({
      latitude: Number(/\blat=["']([^"']+)["']/.exec(point[1])?.[1]),
      longitude: Number(/\blon=["']([^"']+)["']/.exec(point[1])?.[1]),
      elevation: /<ele>([^<]+)<\/ele>/.test(point[2]) ? Number(/<ele>([^<]+)<\/ele>/.exec(point[2])[1]) : null,
      time: /<time>([^<]+)<\/time>/.exec(point[2])?.[1] ?? null,
    }))
  );
  const points = segments.flat();
  assert.ok(segments.length && segments.every((segment) => segment.length >= 2));
  assert.ok(points.every((p) => Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 && (p.elevation === null || Number.isFinite(p.elevation))));
  const distanceKm = segments.reduce((total, segment) => total + segment.slice(1).reduce((sum, p, i) => sum + distance(segment[i], p), 0), 0);
  const validTimes = points.every((p, i) => p.time && Number.isFinite(Date.parse(p.time)) && (!i || Date.parse(p.time) >= Date.parse(points[i - 1].time)));
  const durationMinutes = validTimes ? Math.round((Date.parse(points.at(-1).time) - Date.parse(points[0].time)) / 60000) : null;
  const summit = route.roundTrip ? points.reduce((best, p) => (p.elevation ?? -Infinity) > (best.elevation ?? -Infinity) ? p : best) : points.at(-1);
  const coordinate = (p) => [p.longitude, p.latitude];
  const metadata = {
    source: route.source, sha256: createHash('sha256').update(xml).digest('hex'), slug: route.slug,
    pointCount: points.length, segmentCount: segments.length,
    distanceKm: Number(distanceKm.toFixed(6)),
    totalDistanceKm: Number(distanceKm.toFixed(6)) * (route.roundTrip ? 1 : 2),
    durationMinutes: durationMinutes > 0 ? durationMinutes : null,
    direction: route.roundTrip ? 'round_trip' : 'one_way_return_same_path',
    startedAt: validTimes ? points[0].time : null, endedAt: validTimes ? points.at(-1).time : null,
    start: coordinate(points[0]), summit: coordinate(summit), end: coordinate(points.at(-1)),
    maxElevationM: Math.max(...points.map((p) => p.elevation ?? -Infinity)),
  };
  const coordinates = segments.map((segment) => segment.map((p) => p.elevation === null ? coordinate(p) : [...coordinate(p), p.elevation]));
  const geojson = { type: 'Feature', properties: { name: route.name, direction: metadata.direction }, geometry: segments.length === 1 ? { type: 'LineString', coordinates: coordinates[0] } : { type: 'MultiLineString', coordinates } };
  await artifact(`public/data/${route.prefix}.geojson`, geojson);
  await artifact(`public/data/${route.prefix}-metadata.json`, metadata);
  console.log(JSON.stringify(metadata));
}
