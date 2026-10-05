'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  connectAuthEmulator,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

let auth: Auth | undefined;

/**
 * Lazily initialised Firebase Auth (browser only). Connects to the emulator in local dev.
 *
 * Sign-ins last only for this browser tab: closing the tab or the browser signs the person out,
 * so the next student on a shared college computer has to sign in again. (A page reload keeps it.)
 */
export function firebaseAuth(): Auth {
  if (auth) return auth;
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
  auth = initializeAuth(app, {
    persistence: browserSessionPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator) connectAuthEmulator(auth, emulator, { disableWarnings: true });
  forgetOldSavedLogin();
  return auth;
}

/** Earlier versions kept sign-ins on the computer for good; remove anything left from that. */
function forgetOldSavedLogin() {
  try {
    indexedDB.deleteDatabase('firebaseLocalStorageDb');
    for (const k of Object.keys(localStorage))
      if (k.startsWith('firebase:authUser:')) localStorage.removeItem(k);
  } catch {
    /* storage blocked — nothing saved anyway */
  }
}
