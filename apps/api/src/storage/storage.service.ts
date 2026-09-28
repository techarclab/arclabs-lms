import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export type StorageArea =
  'courses' | 'lessons' | 'submissions' | 'projects' | 'certificates' | 'branding' | 'avatars';

/** S3-compatible storage (MinIO locally, Cloudflare R2 in production). See ADR 0003. */
@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.s3 = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }

  buildKey(orgId: string, area: StorageArea, entityId: string, fileName: string) {
    const safe = fileName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .slice(-100);
    return `org/${orgId}/${area}/${entityId}/${randomUUID()}-${safe}`;
  }

  /** Browser PUTs the file directly to this URL. Caller must authorize first. */
  presignUpload(key: string, contentType: string, expiresInSec = 300) {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSec },
    );
  }

  presignDownload(key: string, expiresInSec = 300) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSec,
    });
  }
}
