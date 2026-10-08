/** Links de mapa via OpenStreetMap (sem dependência de provedores proprietários). */

export function mapUrlForDestination(destination: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`;
}
