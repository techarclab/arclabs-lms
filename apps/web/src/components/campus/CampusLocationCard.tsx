'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CampusSettings, GeocodeResult } from '@arc/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Input,
} from '@arc/ui';
import { useApi, useApiMutation } from '@/lib/use-api';

/** Where to start when no campus is set yet (Hyderabad). */
const DEFAULT_CENTER: [number, number] = [17.385, 78.4867];

/**
 * OpenStreetMap with the campus pin and its radius. With `onPick`, clicking the map (or dragging
 * the pin) moves the campus there.
 */
export function CampusMap({
  lat,
  lng,
  radiusM,
  onPick,
  className,
}: {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map | null>(null);
  const layer = useRef<{ pin: import('leaflet').Marker; ring: import('leaflet').Circle } | null>(
    null,
  );
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [L, setL] = useState<typeof import('leaflet') | null>(null);

  // Leaflet needs the browser, so it is loaded here rather than imported at the top.
  useEffect(() => {
    let alive = true;
    void import('leaflet').then((m) => alive && setL(m.default ?? m));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!L || !box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(
      lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER,
      lat !== null ? 16 : 11,
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    m.on('click', (e: import('leaflet').LeafletMouseEvent) =>
      pickRef.current?.(e.latlng.lat, e.latlng.lng),
    );
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, [L]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pin + radius follow the chosen point.
  useEffect(() => {
    const m = map.current;
    if (!L || !m) return;
    if (lat === null || lng === null) {
      layer.current?.pin.remove();
      layer.current?.ring.remove();
      layer.current = null;
      return;
    }
    const at: [number, number] = [lat, lng];
    if (!layer.current) {
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#4f46e5;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transform:rotate(-45deg)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });
      const pin = L.marker(at, { icon, draggable: Boolean(pickRef.current) }).addTo(m);
      pin.on('dragend', () => {
        const p = pin.getLatLng();
        pickRef.current?.(p.lat, p.lng);
      });
      const ring = L.circle(at, {
        radius: radiusM,
        color: '#4f46e5',
        weight: 2,
        fillColor: '#6366f1',
        fillOpacity: 0.12,
      }).addTo(m);
      layer.current = { pin, ring };
      m.fitBounds(ring.getBounds(), { padding: [20, 20] });
    } else {
      layer.current.pin.setLatLng(at);
      layer.current.ring.setLatLng(at);
      layer.current.ring.setRadius(radiusM);
      // A point found by search / current location may be off-screen: bring it into view.
      if (!m.getBounds().contains(at))
        m.fitBounds(layer.current.ring.getBounds(), { padding: [20, 20] });
    }
  }, [L, lat, lng, radiusM]);

  return (
    <div className={cn('overflow-hidden rounded-xl border border-ink-200', className)}>
      <div className="relative">
        <div ref={box} className="z-0 h-64 w-full bg-ink-100" />
        {onPick && (
          <span className="pointer-events-none absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-ink-950/80 px-3 py-1 text-[11.5px] font-medium whitespace-nowrap text-white">
            Click the map or drag the pin to set the campus
          </span>
        )}
      </div>
      {lat !== null && lng !== null && (
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-ink-100 bg-ink-50/60 px-3 py-1.5 text-xs text-brand-700 hover:underline"
        >
          {lat.toFixed(5)}, {lng.toFixed(5)} · {radiusM} m radius · open in Google Maps
        </a>
      )}
    </div>
  );
}

/**
 * College admins: where the campus is, for exams that must be written on campus. Search the
 * address, paste a Google Maps link / "lat, lng", or stand on campus and use the current location.
 */
export function CampusLocationCard({ orgId }: { orgId: string }) {
  const mutate = useApiMutation();
  const { data, mutate: reload } = useApi<CampusSettings>('/campus', { orgId });
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [draft, setDraft] = useState<{
    address: string;
    lat: number | null;
    lng: number | null;
    radiusM: string;
  }>({ address: '', lat: null, lng: null, radiusM: '300' });
  const [busy, setBusy] = useState<'search' | 'here' | 'save' | null>(null);
  const set = data?.lat != null && data?.lng != null;
  const radius = Number(draft.radiusM);
  const radiusOk = Number.isInteger(radius) && radius >= 50 && radius <= 5000;

  function startEdit() {
    setDraft({
      address: data?.address ?? '',
      lat: data?.lat ?? null,
      lng: data?.lng ?? null,
      radiusM: String(data?.radiusM ?? 300),
    });
    setQuery('');
    setResults(null);
    setEditing(true);
  }

  async function search() {
    if (query.trim().length < 3) return;
    setBusy('search');
    try {
      const r = await mutate<GeocodeResult[]>(
        `/campus/geocode?q=${encodeURIComponent(query.trim())}`,
        'GET',
        undefined,
        orgId,
      );
      setResults(r);
      if (r.length === 1) pick(r[0]!);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function pick(r: GeocodeResult) {
    setDraft((d) => ({
      ...d,
      lat: r.lat,
      lng: r.lng,
      address: /^-?\d/.test(r.label) ? d.address : r.label.split(',').slice(0, 4).join(','),
    }));
  }

  function useHere() {
    if (!navigator.geolocation) {
      toast.error('This browser can’t share its location.');
      return;
    }
    setBusy('here');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(null);
        setDraft((d) => ({ ...d, lat: p.coords.latitude, lng: p.coords.longitude }));
        toast.success(`Location found (±${Math.round(p.coords.accuracy)} m)`, {
          description:
            p.coords.accuracy > 100
              ? 'That’s rough — on a laptop, turn on Wi-Fi, or do this on your phone on campus.'
              : undefined,
        });
      },
      (err) => {
        setBusy(null);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in the browser’s address bar and try again.'
            : 'Couldn’t get your location. Try again, or search the address instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  async function save(clear = false) {
    setBusy('save');
    try {
      const r = await mutate<CampusSettings>(
        '/campus',
        'PUT',
        clear
          ? { lat: null, lng: null, radiusM: data?.radiusM ?? 300 }
          : { address: draft.address, lat: draft.lat, lng: draft.lng, radiusM: radius },
        orgId,
      );
      void reload(r, { revalidate: false });
      setEditing(false);
      toast.success(clear ? 'Campus location removed' : 'Campus location saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card id="campus">
      <CardHeader>
        <div>
          <CardTitle>Campus location</CardTitle>
          <CardDescription>
            For exams marked “Students must be on campus”: students can start only within this
            radius.
          </CardDescription>
        </div>
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <MapPin className="size-[18px]" />
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing ? (
          set ? (
            <>
              <div className="text-sm">
                <p className="font-medium text-ink-900">{data!.address || 'Campus'}</p>
                <p className="text-ink-500">Radius {data!.radiusM} m</p>
              </div>
              <CampusMap lat={data!.lat!} lng={data!.lng!} radiusM={data!.radiusM} />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={startEdit}>
                  <MapPin /> Change
                </Button>
                <Button
                  variant="ghost"
                  loading={busy === 'save'}
                  onClick={() => void save(true)}
                  className="text-rose-600"
                >
                  <Trash2 /> Remove
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-500">
                Not set. On-campus exams can’t be published until the campus is set.
              </p>
              <Button onClick={startEdit} disabled={!data}>
                <MapPin /> Set campus location
              </Button>
            </>
          )
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <Input
                leading={<Search />}
                autoFocus
                placeholder="College address, Google Maps link, or 17.4206, 78.6552"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button
                type="submit"
                variant="secondary"
                loading={busy === 'search'}
                disabled={query.trim().length < 3}
              >
                Find
              </Button>
            </form>
            {results && (
              <ul className="max-h-48 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      className={cn(
                        'w-full px-3 py-2 text-left text-[13px] transition hover:bg-ink-50',
                        draft.lat === r.lat && draft.lng === r.lng && 'bg-brand-50 text-brand-800',
                      )}
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
                {!results.length && (
                  <li className="px-3 py-3 text-[13px] text-ink-500">
                    Nothing found. Try a shorter address (college name + area), paste the college’s
                    Google Maps link, or use your current location on campus.
                  </li>
                )}
              </ul>
            )}
            <Button
              variant="secondary"
              className="h-auto w-full py-2 whitespace-normal"
              loading={busy === 'here'}
              onClick={useHere}
            >
              <Crosshair className="shrink-0" /> Use my current location
              <span className="font-normal text-ink-500">(when you are on campus)</span>
            </Button>
            <CampusMap
              lat={draft.lat}
              lng={draft.lng}
              radiusM={radiusOk ? radius : 300}
              onPick={(lat, lng) => setDraft((d) => ({ ...d, lat, lng }))}
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <label className="text-[13px] text-ink-600">
                Name shown to students
                <Input
                  className="mt-1"
                  placeholder="e.g. Anurag University, Venkatapur"
                  value={draft.address}
                  maxLength={300}
                  onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                />
              </label>
              <label className="text-[13px] text-ink-600">
                Radius (m)
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={draft.radiusM}
                  onChange={(e) => setDraft((d) => ({ ...d, radiusM: e.target.value }))}
                />
              </label>
            </div>
            {!radiusOk && (
              <p className="text-[13px] text-rose-700">Radius must be 50 to 5000 metres.</p>
            )}
            <p className="text-xs text-ink-500">
              Tip: put the pin in the middle of the campus. 300 m covers most colleges; make it
              bigger if your campus is large.
            </p>
            <div className="flex gap-2">
              <Button
                loading={busy === 'save'}
                disabled={draft.lat === null || draft.lng === null || !radiusOk}
                onClick={() => void save()}
              >
                Save campus
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
