/**
 * Geofence for on-campus exams: is the student's browser location within the college's radius?
 * The browser reports an accuracy (metres); a little of it is allowed so a student standing at the
 * edge of the campus is not shut out, but never more than ACCURACY_ALLOWANCE_M.
 */

/** At most this much of the browser's reported accuracy is added to the campus radius. */
export const ACCURACY_ALLOWANCE_M = 100;
/** Positions rougher than this can't tell campus from home (laptops without Wi-Fi location). */
export const MAX_USABLE_ACCURACY_M = 1500;

export interface Campus {
  lat: number;
  lng: number;
  radiusM: number;
}
export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeofenceVerdict =
  | { inside: true; distanceM: number }
  | { inside: false; distanceM: number; reason: 'OFF_CAMPUS' | 'LOCATION_IMPRECISE' };

export function checkGeofence(campus: Campus, pos: Position): GeofenceVerdict {
  const d = Math.round(distanceM(campus, pos));
  const accuracy = Math.max(0, pos.accuracy);
  if (d <= campus.radiusM + Math.min(accuracy, ACCURACY_ALLOWANCE_M))
    return { inside: true, distanceM: d };
  // Far away with a rough fix: say so, so the student can turn on precise location and retry.
  if (accuracy > MAX_USABLE_ACCURACY_M)
    return { inside: false, distanceM: d, reason: 'LOCATION_IMPRECISE' };
  return { inside: false, distanceM: d, reason: 'OFF_CAMPUS' };
}

/** "350 m" / "4.2 km" */
export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
