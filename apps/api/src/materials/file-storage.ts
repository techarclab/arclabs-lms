import { Inject, Injectable, Logger } from '@nestjs/common';
import { Storage, type Bucket } from '@google-cloud/storage';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/** Swappable in tests. */
export const MATERIAL_FILES = Symbol('MATERIAL_FILES');

export interface MaterialFiles {
  readonly configured: boolean;
  /** Signed URL the browser PUTs the file to (with this exact Content-Type). */
  uploadUrl(path: string, contentType: string): Promise<string>;
  /** Short-lived link to view (inline) or download (attachment) a file. */
  readUrl(path: string, opts: { download: boolean; fileName: string }): Promise<string>;
  /** Size and type of an uploaded file, or null if it isn't there. */
  stat(path: string): Promise<{ size: number; contentType: string | null } | null>;
  remove(path: string): Promise<void>;
}

const UPLOAD_MINUTES = 30;
const READ_HOURS = 3;

/**
 * Uploaded study materials live in Firebase Storage (a Google Cloud Storage bucket). The bucket
 * stays private: browsers upload and download with signed URLs the API hands out after checking
 * who is asking.
 */
@Injectable()
export class FirebaseMaterialFiles implements MaterialFiles {
  private readonly logger = new Logger('MaterialFiles');
  private bucket?: Bucket;
  private corsReady = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured() {
    return Boolean(this.env.FIREBASE_STORAGE_BUCKET && this.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  private get b(): Bucket {
    if (!this.bucket) {
      const sa = JSON.parse(this.env.FIREBASE_SERVICE_ACCOUNT_JSON!) as {
        project_id: string;
        client_email: string;
        private_key: string;
      };
      this.bucket = new Storage({
        projectId: sa.project_id,
        credentials: { client_email: sa.client_email, private_key: sa.private_key },
      }).bucket(this.env.FIREBASE_STORAGE_BUCKET!.replace(/^gs:\/\//, ''));
    }
    return this.bucket;
  }

  /** Browsers upload straight to the bucket, which needs CORS for our website. Set it once. */
  private async ensureCors() {
    if (this.corsReady) return;
    const origins = [
      ...new Set(
        this.env.WEB_ORIGIN.split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    ];
    try {
      const [meta] = await this.b.getMetadata();
      const have = (meta.cors ?? []).flatMap((c) => c.origin ?? []);
      if (!origins.every((o) => have.includes(o))) {
        await this.b.setCorsConfiguration([
          {
            origin: [...new Set([...have, ...origins])],
            method: ['GET', 'HEAD', 'PUT'],
            responseHeader: ['Content-Type', 'Content-Disposition', 'Content-Length'],
            maxAgeSeconds: 3600,
          },
        ]);
        this.logger.log(`Storage CORS set for ${origins.join(', ')}`);
      }
      this.corsReady = true;
    } catch (e) {
      // Not fatal: the bucket's CORS can also be set by hand (docs/DEPLOYMENT.md §12).
      this.logger.warn(`Could not set storage CORS: ${(e as Error).message}`);
      this.corsReady = true;
    }
  }

  async uploadUrl(path: string, contentType: string) {
    await this.ensureCors();
    const [url] = await this.b.file(path).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + UPLOAD_MINUTES * 60_000,
      contentType,
    });
    return url;
  }

  async readUrl(path: string, opts: { download: boolean; fileName: string }) {
    const safe = opts.fileName.replace(/["\\\r\n]/g, '_');
    const [url] = await this.b.file(path).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + READ_HOURS * 3_600_000,
      responseDisposition: `${opts.download ? 'attachment' : 'inline'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`,
    });
    return url;
  }

  async stat(path: string) {
    try {
      const [meta] = await this.b.file(path).getMetadata();
      return { size: Number(meta.size ?? 0), contentType: meta.contentType ?? null };
    } catch {
      return null;
    }
  }

  async remove(path: string) {
    try {
      await this.b.file(path).delete({ ignoreNotFound: true });
    } catch (e) {
      this.logger.warn(`Could not delete ${path}: ${(e as Error).message}`);
    }
  }
}
