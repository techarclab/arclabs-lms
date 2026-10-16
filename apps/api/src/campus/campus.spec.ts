import { parseCoordinates } from './campus.service';

describe('parseCoordinates', () => {
  it('reads plain coordinates', () => {
    expect(parseCoordinates('17.4206, 78.6552')).toEqual({ lat: 17.4206, lng: 78.6552 });
    expect(parseCoordinates(' 17.4206 78.6552 ')).toEqual({ lat: 17.4206, lng: 78.6552 });
  });
  it('reads Google Maps links, preferring the pin over the map view', () => {
    expect(
      parseCoordinates(
        'https://www.google.com/maps/place/Anurag+University/@17.4180,78.6500,16z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d17.4206!4d78.6552',
      ),
    ).toEqual({ lat: 17.4206, lng: 78.6552 });
    expect(parseCoordinates('https://www.google.com/maps/@17.42,78.65,17z')).toEqual({
      lat: 17.42,
      lng: 78.65,
    });
    expect(parseCoordinates('https://maps.google.com/?q=17.4206,78.6552')).toEqual({
      lat: 17.4206,
      lng: 78.6552,
    });
  });
  it('reads OpenStreetMap links', () => {
    expect(parseCoordinates('https://www.openstreetmap.org/#map=17/17.42060/78.65520')).toEqual({
      lat: 17.4206,
      lng: 78.6552,
    });
  });
  it('ignores addresses and impossible values', () => {
    expect(parseCoordinates('Anurag University, Venkatapur, Hyderabad 500088')).toBeNull();
    expect(parseCoordinates('95, 200')).toBeNull();
  });
});
