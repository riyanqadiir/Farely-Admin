/** Build a Google Maps open URL — prefers coordinates when valid, else search by address. */
export function hasValidCoords(c: { latitude: number; longitude: number } | undefined | null): boolean {
  if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') return false;
  if (Number.isNaN(c.latitude) || Number.isNaN(c.longitude)) return false;
  if (c.latitude === 0 && c.longitude === 0) return false;
  return true;
}

export function formatCoordPair(c: { latitude: number; longitude: number }): string {
  return `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`;
}

export function googleMapsOpenUrl(
  address: string,
  coords?: { latitude: number; longitude: number } | null,
): string {
  if (coords && hasValidCoords(coords)) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`;
  }
  const q = encodeURIComponent(address || '');
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
