import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../public/data/ruta-santa-maria.gpx', import.meta.url);
const geojsonTarget = new URL('../public/data/santa-maria-route.geojson', import.meta.url);
const metadataTarget = new URL('../public/data/santa-maria-route-metadata.json', import.meta.url);
const xml = await readFile(source, 'utf8');
const points = [...xml.matchAll(/<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>[\s\S]*?<ele>([^<]+)<\/ele>[\s\S]*?<time>([^<]+)<\/time>[\s\S]*?<\/trkpt>/g)].map((match) => ({
  latitude: Number(match[1]), longitude: Number(match[2]), elevation: Number(match[3]), time: match[4],
}));
if (points.length < 2 || points.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || !Number.isFinite(point.elevation))) throw new Error('GPX track is invalid.');
const radians = (value) => value * Math.PI / 180;
let distanceKm = 0; let elevationGainM = 0;
for (let index = 1; index < points.length; index += 1) {
  const previous = points[index - 1]; const current = points[index];
  const deltaLatitude = radians(current.latitude - previous.latitude); const deltaLongitude = radians(current.longitude - previous.longitude);
  const value = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(previous.latitude)) * Math.cos(radians(current.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  distanceKm += 2 * 6371 * Math.asin(Math.sqrt(value));
  elevationGainM += Math.max(0, current.elevation - previous.elevation);
}
const durationMinutes = (Date.parse(points.at(-1).time) - Date.parse(points[0].time)) / 60000;
const metadata = {
  source: 'ruta-santa-maria.gpx', pointCount: points.length,
  distanceKm: Number(distanceKm.toFixed(3)), elevationGainM: Math.round(elevationGainM),
  startElevationM: Math.round(points[0].elevation), maxElevationM: Math.round(Math.max(...points.map((point) => point.elevation))),
  durationMinutes: Math.round(durationMinutes), direction: 'one_way_ascent',
  start: [points[0].longitude, points[0].latitude], summit: [points.at(-1).longitude, points.at(-1).latitude],
};
if (process.argv.includes('--check')) {
  if (Math.abs(points.length - 959) > 2 || Math.abs(distanceKm - 6.06) > 0.1 || Math.abs(elevationGainM - 934) > 20 || Math.abs(durationMinutes - 185) > 5) throw new Error(`Unexpected route metrics: ${JSON.stringify(metadata)}`);
  console.log(JSON.stringify(metadata));
} else {
  const geojson = { type: 'Feature', properties: { name: 'Ruta de ascenso al Volcán Santa María', direction: 'ascent' }, geometry: { type: 'LineString', coordinates: points.map((point) => [point.longitude, point.latitude, point.elevation]) } };
  await writeFile(geojsonTarget, `${JSON.stringify(geojson)}\n`);
  await writeFile(metadataTarget, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Generated route with ${points.length} points.`);
}
