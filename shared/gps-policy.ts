export type OrientationPosition = { longitude: number; latitude: number; accuracy: number; timestamp: number };

export function acceptsPosition(previous: OrientationPosition | null, next: OrientationPosition): boolean {
  if (![next.longitude, next.latitude, next.accuracy, next.timestamp].every(Number.isFinite)
    || Math.abs(next.latitude) > 90 || Math.abs(next.longitude) > 180 || next.accuracy < 0) return false;
  if (!previous) return true;
  const elapsed = next.timestamp - previous.timestamp;
  if (elapsed <= 0) return false;
  const radians = (value: number) => value * Math.PI / 180;
  const a = Math.sin(radians(next.latitude - previous.latitude) / 2) ** 2
    + Math.cos(radians(previous.latitude)) * Math.cos(radians(next.latitude))
    * Math.sin(radians(next.longitude - previous.longitude) / 2) ** 2;
  const distance = 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  // Allow movement and accuracy variation. Only reject jumps inconsistent with
  // elapsed time and both uncertainty radii. Never hide a bad accuracy reading.
  return distance <= Math.max(100, elapsed / 1000 * 12 + previous.accuracy + next.accuracy);
}

export function watchOrientation(geolocation: Pick<Geolocation, 'watchPosition' | 'clearWatch'>,
  success: PositionCallback, error: PositionErrorCallback): () => void {
  const id = geolocation.watchPosition(success, error, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  return () => geolocation.clearWatch(id);
}
