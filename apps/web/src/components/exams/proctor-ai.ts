'use client';

/**
 * Camera AI for exams — runs entirely in the student's browser (MediaPipe, WebAssembly).
 *
 * Every ~0.4 s it looks at the camera frame and works out:
 *   - how many faces are in view (none → away from the desk; two → someone helping)
 *   - where the head points (turned sideways / down, e.g. towards another screen or a phone)
 *   - where the eyes look (sideways / down)
 * and every ~1.2 s whether a mobile phone is visible.
 *
 * It first WARNS on screen; only if the behaviour continues (or keeps repeating) does it report a
 * violation, with a small photo taken at that moment as evidence. Video is never streamed or saved.
 */
import { useEffect, useRef, useState } from 'react';
import type { FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision';

export type CameraIssue = 'FACE_MISSING' | 'MULTIPLE_FACES' | 'LOOKING_AWAY' | 'PHONE_DETECTED';

export const ISSUE_MESSAGE: Record<CameraIssue, string> = {
  FACE_MISSING: 'We can’t see your face. Sit in front of the camera.',
  MULTIPLE_FACES: 'Someone else is in view. Only you may be in the camera.',
  LOOKING_AWAY: 'Look at your exam screen.',
  PHONE_DETECTED: 'A phone is visible. Put it away.',
};

// ───────── Detection models (loaded once, from our own site) ─────────

type Models = { face: FaceLandmarker; objects: ObjectDetector | null };

/** A phone held up to a laptop camera often scores only 0.3–0.5, so accept from 0.3. */
const PHONE_MIN_SCORE = 0.3;
let modelsPromise: Promise<Models | null> | null = null;

export function loadProctorModels(): Promise<Models | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  modelsPromise ??= (async () => {
    try {
      const { FilesetResolver, FaceLandmarker, ObjectDetector } =
        await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      const make = async <T>(fn: (delegate: 'GPU' | 'CPU') => Promise<T>) => {
        try {
          return await fn('GPU');
        } catch {
          return fn('CPU'); // no WebGL: slower, still fine at a few frames per second
        }
      };
      const face = await make((delegate) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/proctor/face_landmarker.task', delegate },
          runningMode: 'VIDEO',
          numFaces: 3,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
        }),
      );
      const objects = await make((delegate) =>
        ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/proctor/efficientdet_lite0.tflite', delegate },
          runningMode: 'VIDEO',
          scoreThreshold: PHONE_MIN_SCORE,
          maxResults: 3,
          categoryAllowlist: ['cell phone'],
        }),
      ).catch(() => null);
      return { face, objects };
    } catch (e) {
      console.warn('Camera AI unavailable', e);
      return null;
    }
  })();
  return modelsPromise;
}

// ───────── What one frame shows ─────────

export interface FrameObservation {
  /** Faces near the camera (the student, or someone sitting with them). */
  faces: number;
  /** Every face detected, including people far behind. */
  allFaces?: number;
  /** Head rotation in degrees (only with exactly one face). */
  yaw?: number;
  pitch?: number;
  /** 0–1: how far the eyes look sideways / down. */
  gazeSide?: number;
  gazeDown?: number;
  /** Set on frames where the phone detector ran. */
  phone?: boolean;
  phoneScore?: number;
}

function observe(models: Models, video: HTMLVideoElement, t: number, withPhone: boolean) {
  const r = models.face.detectForVideo(video, t);
  // Only count faces close to the camera: a face much smaller than the largest one is someone
  // further back in the hall (e.g. faculty walking around), not someone helping the student.
  const widths = r.faceLandmarks.map((pts) => {
    let lo = 1;
    let hi = 0;
    for (const p of pts) {
      if (p.x < lo) lo = p.x;
      if (p.x > hi) hi = p.x;
    }
    return Math.max(0, hi - lo);
  });
  const biggest = Math.max(0, ...widths);
  const near = widths.filter((w) => w >= biggest * NEAR_FACE_RATIO).length;
  const obs: FrameObservation = { faces: near, allFaces: widths.length };
  if (obs.faces === 1) {
    const m = r.facialTransformationMatrixes?.[0]?.data;
    if (m && m.length >= 16) {
      // column-major 4x4; rotation part R[row][col] = m[col*4+row]
      obs.yaw = (Math.atan2(m[8]!, m[10]!) * 180) / Math.PI;
      obs.pitch = (Math.atan2(-m[9]!, m[10]!) * 180) / Math.PI;
    }
    const bs = r.faceBlendshapes?.[0]?.categories;
    if (bs) {
      const s = (name: string) => bs.find((c) => c.categoryName === name)?.score ?? 0;
      obs.gazeSide = Math.max(
        (s('eyeLookInLeft') + s('eyeLookOutRight')) / 2,
        (s('eyeLookOutLeft') + s('eyeLookInRight')) / 2,
      );
      obs.gazeDown = (s('eyeLookDownLeft') + s('eyeLookDownRight')) / 2;
    }
  }
  if (withPhone && models.objects) {
    const d = models.objects.detectForVideo(video, t + 0.001);
    const best = Math.max(0, ...d.detections.map((x) => x.categories[0]?.score ?? 0));
    obs.phone = best >= PHONE_MIN_SCORE;
    obs.phoneScore = Math.round(best * 100) / 100;
  }
  return obs;
}

// ───────── Warn first, then report (pure logic — unit-tested) ─────────

export interface MonitorOutput {
  /** Behaviour currently on screen as a warning. */
  warning: CameraIssue | null;
  /** Report this now as a violation. */
  violation: CameraIssue | null;
}

const WARN_AFTER: Record<CameraIssue, number> = {
  FACE_MISSING: 2000,
  LOOKING_AWAY: 2500,
  MULTIPLE_FACES: 0,
  PHONE_DETECTED: 0,
};
const VIOLATE_AFTER: Record<CameraIssue, number> = {
  FACE_MISSING: 8000,
  LOOKING_AWAY: 7000,
  // Someone must STAY in view this long: faculty walking past takes a few seconds at most.
  MULTIPLE_FACES: 8000,
  PHONE_DETECTED: 1500,
};
/**
 * A second face must be at least this big (relative to the largest face) to count. Someone
 * standing 2–3 m behind the student shows up at well under half the size.
 */
export const NEAR_FACE_RATIO = 0.45;
/**
 * Which issues count towards auto-submit (the server decides; this is for on-screen text).
 * Face missing / looking away are only flagged with a photo for faculty to review — they have
 * too many innocent causes (bad light, thinking, looking at rough paper).
 */
export const COUNTED_ISSUES: ReadonlySet<CameraIssue> = new Set([
  'MULTIPLE_FACES',
  'PHONE_DETECTED',
]);
/**
 * Looking away is judged against THIS student's normal pose and gaze while reading the screen
 * (laptop cameras sit above the screen, so reading the lower half looks like "eyes down"), on a
 * short rolling median so one noisy frame (a hand on the chin, a blink) never counts.
 */
export const YAW_LIMIT = 30; // head turned sideways (degrees beyond normal)
const PITCH_DOWN_LIMIT = 28; // head bent down beyond normal
const PITCH_DOWN_LIMIT_TYPING = 40; // looking at the keyboard while typing is fine
const PITCH_UP_LIMIT = 25;
const GAZE_SIDE_EXTRA = 0.35; // eyes sideways beyond normal…
const GAZE_SIDE_MIN = 0.7; // …and clearly sideways
const SMOOTH_FRAMES = 5; // ~2 s of frames: decisions use the median of these
const CALIBRATE_FRAMES = 15; // ~6 s at the start learns the normal pose
const ADAPT_RATE = 0.01; // the normal pose follows slow posture changes
const CLEAR_AFTER_MS = 1200; // flicker tolerance
const REPEAT_WINDOW_MS = 90_000; // 3 warnings of the same kind in this window → violation
const REPEAT_LIMIT = 3;
const COOLDOWN_MS = 30_000; // don't report the same kind again right away
const GLANCE_MIN_MS = 1500; // look-aways shorter than this are ignored
const GLANCE_WINDOW_MS = 60_000;
const GLANCE_LIMIT = 8; // 8 look-aways within a minute → flagged (warning from the 5th)

const median = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b[Math.floor(b.length / 2)] ?? 0;
};

export class CameraMonitor {
  private since = new Map<CameraIssue, number>();
  private lastSeen = new Map<CameraIssue, number>();
  private warned = new Map<CameraIssue, number[]>();
  private warnedThisRun = new Set<CameraIssue>();
  private reportedAt = new Map<CameraIssue, number>();
  private baseline: { yaw: number; pitch: number; gazeSide: number } | null = null;
  private samples: { yaw: number; pitch: number; gazeSide: number }[] = [];
  private recent: { yaw: number; pitch: number; gazeSide: number }[] = [];
  private phoneHitAt = -Infinity;
  /** Starts of short look-aways (≥ 1 s) — many of them in a minute is a pattern too. */
  private glances: number[] = [];
  private awayStart: number | null = null;

  /** Which issues this frame shows (after comparing head pose with the student's normal pose). */
  issues(o: FrameObservation, typingRecently: boolean): CameraIssue[] {
    const out: CameraIssue[] = [];
    if (o.faces === 0) out.push('FACE_MISSING');
    else if (o.faces > 1) out.push('MULTIPLE_FACES');
    else if (o.yaw !== undefined && o.pitch !== undefined) {
      if (this.isAway(o, typingRecently)) out.push('LOOKING_AWAY');
    }
    if (o.phone) out.push('PHONE_DETECTED');
    return out;
  }

  /** Rolling, per-student decision: is the student really looking away from the screen? */
  private isAway(o: FrameObservation, typingRecently: boolean) {
    const cur = { yaw: o.yaw!, pitch: o.pitch!, gazeSide: o.gazeSide ?? 0 };
    this.recent.push(cur);
    if (this.recent.length > SMOOTH_FRAMES) this.recent.shift();
    // Learn the normal pose from the first few seconds (ignoring obviously odd frames).
    if (!this.baseline) {
      if (Math.abs(cur.yaw) < 30 && Math.abs(cur.pitch) < 30) this.samples.push(cur);
      if (this.samples.length >= CALIBRATE_FRAMES)
        this.baseline = {
          yaw: median(this.samples.map((x) => x.yaw)),
          pitch: median(this.samples.map((x) => x.pitch)),
          gazeSide: median(this.samples.map((x) => x.gazeSide)),
        };
      return false; // never judge before we know how this student sits
    }
    if (this.recent.length < SMOOTH_FRAMES) return false;
    const b = this.baseline;
    const m = {
      yaw: median(this.recent.map((x) => x.yaw)),
      pitch: median(this.recent.map((x) => x.pitch)),
      gazeSide: median(this.recent.map((x) => x.gazeSide)),
    };
    const dYaw = Math.abs(m.yaw - b.yaw);
    const dPitch = m.pitch - b.pitch; // which sign is "down" depends on the camera, so check both
    const down = typingRecently ? PITCH_DOWN_LIMIT_TYPING : PITCH_DOWN_LIMIT;
    const away =
      dYaw > YAW_LIMIT ||
      Math.abs(dPitch) > Math.max(down, PITCH_UP_LIMIT) ||
      (m.gazeSide > GAZE_SIDE_MIN && m.gazeSide - b.gazeSide > GAZE_SIDE_EXTRA);
    if (!away) {
      // Follow slow posture changes (leaning back, sliding the laptop) while looking at the screen.
      b.yaw += (m.yaw - b.yaw) * ADAPT_RATE;
      b.pitch += (m.pitch - b.pitch) * ADAPT_RATE;
      b.gazeSide += (m.gazeSide - b.gazeSide) * ADAPT_RATE;
    }
    return away;
  }

  update(o: FrameObservation, now: number, typingRecently = false): MonitorOutput {
    const present = new Set(this.issues(o, typingRecently));
    // The phone detector runs on some frames only: keep its last answer in between.
    if (o.phone === undefined && now - this.phoneHitAt < 2000) present.add('PHONE_DETECTED');
    if (o.phone) this.phoneHitAt = now;

    let warning: CameraIssue | null = null;
    let violation: CameraIssue | null = null;

    // Repeated short look-aways (e.g. glancing at a phone again and again).
    if (present.has('LOOKING_AWAY')) this.awayStart ??= now;
    else if (
      this.awayStart !== null &&
      now - (this.lastSeen.get('LOOKING_AWAY') ?? 0) > CLEAR_AFTER_MS
    ) {
      const lastAway = this.lastSeen.get('LOOKING_AWAY') ?? now;
      if (lastAway - this.awayStart >= GLANCE_MIN_MS) this.glances.push(this.awayStart);
      this.awayStart = null;
    }
    this.glances = this.glances.filter((g) => now - g < GLANCE_WINDOW_MS);
    if (this.glances.length >= GLANCE_LIMIT - 3) warning = 'LOOKING_AWAY';
    if (
      this.glances.length >= GLANCE_LIMIT &&
      now - (this.reportedAt.get('LOOKING_AWAY') ?? -Infinity) >= COOLDOWN_MS
    ) {
      violation = 'LOOKING_AWAY';
      this.glances = [];
    }
    const kinds: CameraIssue[] = [
      'PHONE_DETECTED',
      'MULTIPLE_FACES',
      'FACE_MISSING',
      'LOOKING_AWAY',
    ];
    for (const k of kinds) {
      if (present.has(k)) {
        this.lastSeen.set(k, now);
        if (!this.since.has(k)) this.since.set(k, now);
      } else if (now - (this.lastSeen.get(k) ?? 0) > CLEAR_AFTER_MS) {
        this.since.delete(k);
        this.warnedThisRun.delete(k);
        continue;
      }
      const start = this.since.get(k);
      if (start === undefined) continue;
      const dur = now - start;
      const cooling = now - (this.reportedAt.get(k) ?? -Infinity) < COOLDOWN_MS;
      if (dur >= WARN_AFTER[k]) {
        warning = warning === 'LOOKING_AWAY' && k !== 'LOOKING_AWAY' ? k : (warning ?? k);
        if (!this.warnedThisRun.has(k)) {
          this.warnedThisRun.add(k);
          const list = (this.warned.get(k) ?? []).filter((t) => now - t < REPEAT_WINDOW_MS);
          list.push(now);
          this.warned.set(k, list);
          // (Not for a second person: faculty passing by several times is normal in a hall.)
          if (list.length >= REPEAT_LIMIT && k !== 'MULTIPLE_FACES' && !cooling && !violation) {
            violation = k;
            continue;
          }
        }
      }
      if (dur >= VIOLATE_AFTER[k] && !cooling && !violation) violation = k;
    }
    if (violation) {
      this.reportedAt.set(violation, now);
      this.warned.set(violation, []);
      this.since.delete(violation);
      this.warnedThisRun.delete(violation);
    }
    return { warning, violation };
  }
}

// ───────── React hook ─────────

export type ProctorAiStatus = 'loading' | 'ready' | 'unavailable';

function snapshot(video: HTMLVideoElement): string | undefined {
  try {
    const w = 320;
    const h = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w) || 240;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(video, 0, 0, w, h);
    let url = c.toDataURL('image/jpeg', 0.6);
    if (url.length > 85_000) url = c.toDataURL('image/jpeg', 0.35);
    return url.length <= 88_000 ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Watches the camera stream. In the lobby (`reportViolations: false`) it only reports how many
 * faces are visible; during the exam it shows warnings and calls `onViolation`.
 */
export function useProctorAi({
  stream,
  active,
  reportViolations,
  onViolation,
  debug = false,
}: {
  stream: MediaStream | null;
  active: boolean;
  reportViolations: boolean;
  /** Fill `debugInfo` with live head angle / phone score (the ?camcheck=1 test view). */
  debug?: boolean;
  onViolation?: (
    issue: CameraIssue,
    snapshot: string | undefined,
    meta: Record<string, string>,
  ) => void;
}) {
  const [status, setStatus] = useState<ProctorAiStatus>('loading');
  const [faces, setFaces] = useState<number | null>(null);
  const [warning, setWarning] = useState<CameraIssue | null>(null);
  /** Live numbers for the on-screen check (only filled when `debug` is on). */
  const [debugInfo, setDebugInfo] = useState<(FrameObservation & { at: number }) | null>(null);
  /** False when frames stop being analysed (camera frozen, errors) — shown to the student. */
  const [running, setRunning] = useState(false);
  const cb = useRef(onViolation);
  cb.current = onViolation;

  useEffect(() => {
    let alive = true;
    void loadProctorModels().then((m) => alive && setStatus(m ? 'ready' : 'unavailable'));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!active || !stream || status !== 'ready') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    void video.play().catch(() => {});
    const monitor = new CameraMonitor();
    let lastKey = 0;
    const onKey = () => {
      lastKey = Date.now();
    };
    window.addEventListener('keydown', onKey, true);
    let tick = 0;
    let lastT = 0;
    let lastOk = 0;
    let errorLogged = false;
    let lastPhone: Pick<FrameObservation, 'phone' | 'phoneScore'> = {};

    const loop = async () => {
      if (stopped) return;
      const models = await loadProctorModels();
      let delay = 400;
      if (video.paused) void video.play().catch(() => {});
      if (models && video.readyState >= 2 && document.visibilityState === 'visible') {
        const started = performance.now();
        const t = Math.max(started, lastT + 1);
        lastT = t;
        try {
          const o = observe(models, video, t, tick++ % 2 === 0);
          if (o.phone !== undefined) lastPhone = { phone: o.phone, phoneScore: o.phoneScore };
          lastOk = Date.now();
          setRunning(true);
          setFaces(o.faces);
          if (debug) setDebugInfo({ ...lastPhone, ...o, at: Date.now() });
          // Last observation, for support staff debugging a student's camera from the console.
          (window as unknown as { __arcCameraAi?: FrameObservation }).__arcCameraAi = o;
          if (reportViolations) {
            const out = monitor.update(o, Date.now(), Date.now() - lastKey < 2000);
            setWarning(out.warning);
            if (out.violation) {
              const meta: Record<string, string> = { faces: String(o.faces) };
              if (o.allFaces !== undefined) meta.allFaces = String(o.allFaces);
              if (o.yaw !== undefined) meta.yaw = String(Math.round(o.yaw));
              if (o.pitch !== undefined) meta.pitch = String(Math.round(o.pitch));
              if (o.phoneScore) meta.phoneScore = String(o.phoneScore);
              cb.current?.(out.violation, snapshot(video), meta);
            }
          }
        } catch (e) {
          // A dropped frame is fine; keep one line in the console for support.
          if (!errorLogged) console.warn('Camera AI frame failed', e);
          errorLogged = true;
        }
        // Slow machines: back off so the exam itself stays smooth.
        if (performance.now() - started > 250) delay = 900;
      }
      if (Date.now() - lastOk > 5000) setRunning(false);
      timer = setTimeout(() => void loop(), delay);
    };
    void loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
      video.srcObject = null;
      setWarning(null);
      setRunning(false);
    };
  }, [active, stream, status, reportViolations, debug]);

  return { status, faces, warning, running, debugInfo };
}
