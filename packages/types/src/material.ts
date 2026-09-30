/**
 * Study materials are shared as links (Google Drive, Docs, YouTube, Dropbox, OneDrive, websites).
 * `materialLink` works out how a link can be previewed inside the portal and downloaded.
 */

export type MaterialType =
  'pdf' | 'slides' | 'doc' | 'sheet' | 'video' | 'image' | 'code' | 'zip' | 'folder' | 'link';

export type MaterialProvider =
  'youtube' | 'google-drive' | 'google-docs' | 'dropbox' | 'onedrive' | 'web' | 'upload';

export interface MaterialLinkInfo {
  provider: MaterialProvider;
  type: MaterialType;
  /** Opens in a new tab. */
  openUrl: string;
  /** Shown inside the portal (iframe) when possible. */
  embedUrl: string | null;
  /** Direct download, when the provider allows one. */
  downloadUrl: string | null;
}

const EXT_TYPE: Record<string, MaterialType> = {
  pdf: 'pdf',
  ppt: 'slides',
  pptx: 'slides',
  odp: 'slides',
  key: 'slides',
  doc: 'doc',
  docx: 'doc',
  odt: 'doc',
  rtf: 'doc',
  txt: 'doc',
  md: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  ods: 'sheet',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  zip: 'zip',
  rar: 'zip',
  '7z': 'zip',
  tar: 'zip',
  gz: 'zip',
  c: 'code',
  h: 'code',
  cpp: 'code',
  ino: 'code',
  py: 'code',
  java: 'code',
  js: 'code',
  ts: 'code',
  html: 'code',
};

/** File type from a file name or URL path ("notes.PDF" → pdf). */
export function typeFromFileName(name: string): MaterialType | null {
  return typeFromPath(name);
}

// ───────── Uploads (Firebase Storage) ─────────

export const MATERIAL_MAX_UPLOAD_MB = 100;
/** Extensions faculty may upload. */
export const MATERIAL_UPLOAD_EXTENSIONS = [
  'pdf',
  'ppt',
  'pptx',
  'odp',
  'doc',
  'docx',
  'odt',
  'rtf',
  'txt',
  'md',
  'xls',
  'xlsx',
  'csv',
  'ods',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'mp4',
  'webm',
  'mov',
  'zip',
  'rar',
  '7z',
  'c',
  'h',
  'cpp',
  'ino',
  'py',
  'java',
  'js',
  'ts',
  'html',
] as const;

export function uploadExtension(name: string): string | null {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  const ext = m?.[1]?.toLowerCase();
  return ext && (MATERIAL_UPLOAD_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}

function typeFromPath(pathname: string): MaterialType | null {
  const m = /\.([a-z0-9]{1,5})$/i.exec(decodeURIComponent(pathname));
  return m ? (EXT_TYPE[m[1]!.toLowerCase()] ?? null) : null;
}

/** Normalises what an admin pasted into an absolute http(s) URL, or null if it isn't a link. */
export function normalizeMaterialUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = /^\/(?:shorts|embed|live|v)\/([\w-]{6,})/.exec(u.pathname);
    if (m) return m[1]!;
  }
  return null;
}

export function materialLink(url: string): MaterialLinkInfo {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { provider: 'web', type: 'link', openUrl: url, embedUrl: null, downloadUrl: null };
  }
  const host = u.hostname.replace(/^www\./, '');

  // YouTube
  const yt = youtubeId(u);
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    const list = u.searchParams.get('list');
    return {
      provider: 'youtube',
      type: 'video',
      openUrl: url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}${list ? `?list=${encodeURIComponent(list)}` : ''}`,
      downloadUrl: null,
    };
  }
  if (host === 'youtube.com' && u.pathname === '/playlist' && u.searchParams.get('list')) {
    return {
      provider: 'youtube',
      type: 'video',
      openUrl: url,
      embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(u.searchParams.get('list')!)}`,
      downloadUrl: null,
    };
  }

  // Google Docs / Slides / Sheets
  if (host === 'docs.google.com') {
    const m = /^\/(document|presentation|spreadsheets)\/d\/([\w-]{10,})/.exec(u.pathname);
    if (m) {
      const [, kind, id] = m;
      const base = `https://docs.google.com/${kind}/d/${id}`;
      return {
        provider: 'google-docs',
        type: kind === 'document' ? 'doc' : kind === 'presentation' ? 'slides' : 'sheet',
        openUrl: url,
        embedUrl: `${base}/preview`,
        downloadUrl:
          kind === 'document'
            ? `${base}/export?format=pdf`
            : kind === 'presentation'
              ? `${base}/export/pptx`
              : `${base}/export?format=xlsx`,
      };
    }
  }

  // Google Drive files and folders
  if (host === 'drive.google.com') {
    const folder = /^\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/.exec(u.pathname);
    if (folder) {
      return {
        provider: 'google-drive',
        type: 'folder',
        openUrl: url,
        embedUrl: `https://drive.google.com/embeddedfolderview?id=${folder[1]}#list`,
        downloadUrl: null,
      };
    }
    const id =
      /^\/file\/d\/([\w-]{10,})/.exec(u.pathname)?.[1] ??
      (['/open', '/uc'].includes(u.pathname) ? u.searchParams.get('id') : null);
    if (id && /^[\w-]{10,}$/.test(id)) {
      return {
        provider: 'google-drive',
        type: 'pdf', // most shared Drive files are PDFs; the admin can pick another type
        openUrl: `https://drive.google.com/file/d/${id}/view`,
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
      };
    }
  }

  // Dropbox: dl=1 downloads, raw=1 shows the file itself
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
    const dl = new URL(u);
    dl.searchParams.set('dl', '1');
    const isFolder = /^\/(?:scl\/fo|sh)\//.test(u.pathname);
    return {
      provider: 'dropbox',
      type: isFolder ? 'folder' : (typeFromPath(u.pathname) ?? 'link'),
      openUrl: url,
      embedUrl: null,
      downloadUrl: isFolder ? null : dl.toString(),
    };
  }

  // OneDrive / SharePoint: download=1 works on most shared links
  if (host === '1drv.ms' || host.endsWith('onedrive.live.com') || host.endsWith('sharepoint.com')) {
    return {
      provider: 'onedrive',
      type: typeFromPath(u.pathname) ?? 'link',
      openUrl: url,
      embedUrl: null,
      downloadUrl: host.endsWith('sharepoint.com')
        ? `${url}${url.includes('?') ? '&' : '?'}download=1`
        : null,
    };
  }

  // Any other website: a direct file link downloads; PDFs and images can be shown inline.
  const t = typeFromPath(u.pathname);
  const isFile = t !== null;
  return {
    provider: 'web',
    type: t ?? 'link',
    openUrl: url,
    embedUrl:
      t === 'pdf' || t === 'image' || t === 'video'
        ? url
        : t === 'slides' || t === 'doc' || t === 'sheet'
          ? // Microsoft's free viewer shows public Office files
            `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
          : null,
    downloadUrl: isFile ? url : null,
  };
}

/** Link info for an uploaded file, given short-lived signed URLs to view it and to download it. */
export function uploadedLink(
  type: MaterialType,
  viewUrl: string,
  downloadUrl: string,
): MaterialLinkInfo {
  return {
    provider: 'upload',
    type,
    openUrl: viewUrl,
    embedUrl:
      type === 'pdf' || type === 'image' || type === 'video'
        ? viewUrl
        : type === 'slides' || type === 'doc' || type === 'sheet'
          ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewUrl)}`
          : null,
    downloadUrl,
  };
}

// ───────── API shapes ─────────

export interface MaterialFolderItem {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
}

interface MaterialBase {
  id: string;
  title: string;
  description: string | null;
  folderId: string | null;
  /** Type the admin chose; overrides the one guessed from the link. */
  type: MaterialType;
  link: MaterialLinkInfo;
  allowDownload: boolean;
  /** Set when the material is an uploaded file. */
  file: { name: string; size: number | null; mimeType: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialAdminItem extends MaterialBase {
  /** Null for uploaded files. */
  url: string | null;
  published: boolean;
  assignToAll: boolean;
  departments: { id: string; name: string }[];
  createdBy: string | null;
  stats: { viewers: number; views: number; downloads: number };
}

export interface MaterialStudentItem extends MaterialBase {
  organizationName: string;
  /** This student's own activity. */
  viewed: boolean;
  downloaded: boolean;
}

export interface MaterialLibrary<T> {
  folders: MaterialFolderItem[];
  materials: T[];
}

export interface MaterialActivityRow {
  userId: string;
  fullName: string;
  email: string;
  externalId: string | null;
  department: string | null;
  views: number;
  downloads: number;
  lastAt: string | null;
}

export interface MaterialActivityReport {
  materialId: string;
  title: string;
  assigned: number;
  opened: MaterialActivityRow[];
  notOpened: MaterialActivityRow[];
}
