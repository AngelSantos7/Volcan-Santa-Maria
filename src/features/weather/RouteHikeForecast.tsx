import { useEffect, useState } from 'react';
import { getRouteContent } from '../routes/route-service';
import { HikeForecastCard, type HikeForecastCardProps } from './HikeForecastCard';

export function RouteHikeForecast({ routeId, ...props }: HikeForecastCardProps & { routeId: string }) {
  const [destination, setDestination] = useState<{ id: string; coordinate: [number, number] } | null>(null);
  useEffect(() => {
    let active = true;
    if (routeId) void getRouteContent(routeId).then((route) => {
      if (active && route.summitCoordinate) setDestination({ id: routeId, coordinate: route.summitCoordinate });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [routeId]);
  if (!destination || destination.id !== routeId) return null;
  return <HikeForecastCard key={routeId} {...props} coordinate={destination.coordinate} />;
}
