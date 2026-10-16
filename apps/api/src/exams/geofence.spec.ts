import { checkGeofence, distanceM, formatDistance } from './geofence';

// Anurag University, Hyderabad (approx.)
const campus = { lat: 17.4206, lng: 78.6552, radiusM: 300 };
const metresNorth = (m: number) => ({ lat: campus.lat + m / 111_195, lng: campus.lng });

describe('geofence', () => {
  it('measures distance in metres', () => {
    expect(Math.round(distanceM(campus, metresNorth(250)))).toBe(250);
    // campus → Secunderabad is about 17 km
    expect(distanceM(campus, { lat: 17.4399, lng: 78.4983 }) / 1000).toBeGreaterThan(15);
  });

  it('allows positions inside the radius', () => {
    expect(checkGeofence(campus, { ...metresNorth(120), accuracy: 15 })).toEqual({
      inside: true,
      distanceM: 120,
    });
  });

  it('allows a little of the reported accuracy at the edge, but never more than 100 m', () => {
    expect(checkGeofence(campus, { ...metresNorth(350), accuracy: 60 }).inside).toBe(true);
    expect(checkGeofence(campus, { ...metresNorth(450), accuracy: 900 }).inside).toBe(false);
  });

  it('refuses positions from home', () => {
    expect(checkGeofence(campus, { ...metresNorth(4000), accuracy: 20 })).toEqual({
      inside: false,
      distanceM: 4000,
      reason: 'OFF_CAMPUS',
    });
  });

  it('asks for a better fix when the position is very rough', () => {
    expect(checkGeofence(campus, { ...metresNorth(3000), accuracy: 5000 })).toMatchObject({
      inside: false,
      reason: 'LOCATION_IMPRECISE',
    });
  });

  it('formats distances', () => {
    expect(formatDistance(349.6)).toBe('350 m');
    expect(formatDistance(4230)).toBe('4.2 km');
    expect(formatDistance(23_400)).toBe('23 km');
  });
});
