/** Links de mapa via OpenStreetMap (sem dependência de provedores proprietários). */

export function mapUrlForDestination(destination: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`;
}

export function mapUrlForCoordinates(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

export function mapUrlForDirections(
  fromLat: number,
  fromLng: number,
  destination: string
): string {
  return `https://www.openstreetmap.org/directions?from=${fromLat}%2C${fromLng}&to=${encodeURIComponent(destination)}`;
}

export function mapUrlForRoute(
  fromLat: number,
  fromLng: number,
  waypoints: string[]
): string {
  if (waypoints.length === 0) {
    return mapUrlForCoordinates(fromLat, fromLng);
  }
  return mapUrlForDirections(fromLat, fromLng, waypoints[0]);
}
