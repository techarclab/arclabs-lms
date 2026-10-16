import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CampusSettings, GeocodeResult } from '@arc/types';
import type { CampusSettingsInput } from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { OrgContextInfo } from '../auth/auth.types';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/**
 * The college's campus (centre + radius) for on-campus exams. Admins type the address (searched
 * on OpenStreetMap), paste a Google Maps link / "lat, lng", or use their own current location.
 */
@Injectable()
export class CampusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(orgId: string): Promise<CampusSettings> {
    const o = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { campusAddress: true, campusLat: true, campusLng: true, campusRadiusM: true },
    });
    if (!o) throw new NotFoundException();
    return {
      address: o.campusAddress,
      lat: o.campusLat,
      lng: o.campusLng,
      radiusM: o.campusRadiusM,
    };
  }

  async set(actor: User, org: OrgContextInfo, input: CampusSettingsInput) {
    if (org.departmentId)
      throw new ForbiddenException({
        code: 'COLLEGE_ADMIN_ONLY',
        message: 'Only college admins can change the campus location.',
      });
    const clear = input.lat === null || input.lng === null;
    await this.prisma.organization.update({
      where: { id: org.organizationId },
      data: clear
        ? { campusAddress: null, campusLat: null, campusLng: null, campusRadiusM: input.radiusM }
        : {
            campusAddress: input.address?.trim() || null,
            campusLat: input.lat,
            campusLng: input.lng,
            campusRadiusM: input.radiusM,
          },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: org.organizationId,
      action: clear ? 'org.campus_cleared' : 'org.campus_set',
      entityType: 'organization',
      entityId: org.organizationId,
      meta: clear ? {} : { lat: input.lat, lng: input.lng, radiusM: input.radiusM },
    });
    return this.get(org.organizationId);
  }

  /** Address search. Coordinates or a Google Maps link are understood without searching. */
  async geocode(q: string): Promise<GeocodeResult[]> {
    const direct = parseCoordinates(q);
    if (direct) return [{ label: `${direct.lat.toFixed(6)}, ${direct.lng.toFixed(6)}`, ...direct }];
    const search = async (india: boolean) => {
      const url = new URL(NOMINATIM);
      url.search = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '5',
        addressdetails: '0',
        ...(india ? { countrycodes: 'in' } : {}),
      }).toString();
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'ARC-LABS-LMS/1.0 (https://lms.arclabs.in)',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`search responded ${res.status}`);
      const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
      return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
    };
    try {
      const inIndia = await search(true);
      return inIndia.length ? inIndia : await search(false);
    } catch {
      throw new BadGatewayException({
        code: 'GEOCODE_UNAVAILABLE',
        message:
          'Address search isn’t available right now. Paste a Google Maps link or "latitude, longitude" instead, or use your current location.',
      });
    }
  }
}

/**
 * "17.4206, 78.6552", a Google Maps link (…/@17.42,78.65,17z, …?q=17.42,78.65, …!3d17.42!4d78.65)
 * or an OpenStreetMap link (…#map=17/17.42/78.65). Null when it isn't coordinates.
 */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const t = text.trim();
  const ok = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`), // Google place pin (most exact)
    new RegExp(`@${num},${num}`), // Google map view
    new RegExp(`[?&](?:q|query|ll|destination)=${num},\\s*${num}`), // Google query
    new RegExp(`#map=\\d+/${num}/${num}`), // OpenStreetMap
    new RegExp(`^${num}\\s*[, ]\\s*${num}$`), // plain "lat, lng"
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const r = ok(Number(m[1]), Number(m[2]));
      if (r) return r;
    }
  }
  return null;
}
