import { Provider } from '@nestjs/common';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const FIREBASE_AUTH = Symbol('FIREBASE_AUTH');

/**
 * Local dev: FIREBASE_AUTH_EMULATOR_HOST is read by firebase-admin automatically,
 * so tokens from the Auth emulator verify without any credentials.
 * Staging/prod: FIREBASE_SERVICE_ACCOUNT_JSON (or Google default credentials on GCP).
 */
export const firebaseAuthProvider: Provider = {
  provide: FIREBASE_AUTH,
  inject: [ENV],
  useFactory: (env: Env): Auth => {
    const existing = getApps()[0];
    const app: App =
      existing ??
      initializeApp({
        projectId: env.FIREBASE_PROJECT_ID,
        ...(env.FIREBASE_SERVICE_ACCOUNT_JSON
          ? { credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)) }
          : {}),
      });
    return getAuth(app);
  },
};
