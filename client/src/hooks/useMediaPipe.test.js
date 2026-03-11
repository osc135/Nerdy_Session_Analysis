import { describe, it, expect } from 'vitest';
import {
  estimateHeadPose,
  getIrisRatio,
  getEyeAspectRatio,
  getWeightedIrisPosition,
  extractGaze,
  computeEyeContact,
  calculateGazeScore,
  trimBuffer,
  LANDMARKS,
} from './useMediaPipe';

// --- Helper: build a sparse landmarks array with only the indices we need ---
// MediaPipe gives 478 landmarks. We only use ~14 of them.
function makeLandmarks(overrides = {}) {
  const defaults = {
    // Face structure — looking straight at camera, face centered
    [LANDMARKS.NOSE_TIP]:              { x: 0.50, y: 0.55 },
    [LANDMARKS.CHIN]:                  { x: 0.50, y: 0.80 },
    [LANDMARKS.LEFT_EYE_LEFT_CORNER]:  { x: 0.35, y: 0.45 },
    [LANDMARKS.RIGHT_EYE_RIGHT_CORNER]:{ x: 0.65, y: 0.45 },
    [LANDMARKS.LEFT_MOUTH_CORNER]:     { x: 0.40, y: 0.70 },
    [LANDMARKS.RIGHT_MOUTH_CORNER]:    { x: 0.60, y: 0.70 },

    // Left eye opening
    [LANDMARKS.LEFT_EYE_INNER]:  { x: 0.42, y: 0.44 },
    [LANDMARKS.LEFT_EYE_OUTER]:  { x: 0.32, y: 0.44 },
    [LANDMARKS.LEFT_EYE_TOP]:    { x: 0.37, y: 0.42 },
    [LANDMARKS.LEFT_EYE_BOTTOM]: { x: 0.37, y: 0.46 },

    // Right eye opening
    [LANDMARKS.RIGHT_EYE_INNER]:  { x: 0.58, y: 0.44 },
    [LANDMARKS.RIGHT_EYE_OUTER]:  { x: 0.68, y: 0.44 },
    [LANDMARKS.RIGHT_EYE_TOP]:    { x: 0.63, y: 0.42 },
    [LANDMARKS.RIGHT_EYE_BOTTOM]: { x: 0.63, y: 0.46 },

    // Iris centers — centered in each eye = looking at camera
    [LANDMARKS.LEFT_IRIS_CENTER]:  { x: 0.37, y: 0.44 },
    [LANDMARKS.RIGHT_IRIS_CENTER]: { x: 0.63, y: 0.44 },
  };

  const merged = { ...defaults, ...overrides };
  const arr = [];
  for (const [idx, val] of Object.entries(merged)) {
    arr[Number(idx)] = val;
  }
  return arr;
}

// ─── estimateHeadPose ────────────────────────────────────────────────

describe('estimateHeadPose', () => {
  it('returns near-zero yaw and pitch for a centered face', () => {
    const landmarks = makeLandmarks();
    const pose = estimateHeadPose(landmarks);

    expect(Math.abs(pose.yaw)).toBeLessThan(5);
    expect(Math.abs(pose.pitch)).toBeLessThan(10);
  });

  it('returns positive yaw when nose is shifted right (head turned right)', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.NOSE_TIP]: { x: 0.56, y: 0.55 },
    });
    const pose = estimateHeadPose(landmarks);

    expect(pose.yaw).toBeGreaterThan(5);
  });

  it('returns negative yaw when nose is shifted left (head turned left)', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.NOSE_TIP]: { x: 0.44, y: 0.55 },
    });
    const pose = estimateHeadPose(landmarks);

    expect(pose.yaw).toBeLessThan(-5);
  });

  it('returns positive pitch when nose is lower (head tilted down)', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.NOSE_TIP]: { x: 0.50, y: 0.62 },
    });
    const pose = estimateHeadPose(landmarks);

    expect(pose.pitch).toBeGreaterThan(5);
  });
});

// ─── getIrisRatio ────────────────────────────────────────────────────

describe('getIrisRatio', () => {
  it('returns ~0.5 for both axes when iris is centered in the eye', () => {
    const landmarks = makeLandmarks();
    const ratio = getIrisRatio(
      landmarks,
      LANDMARKS.LEFT_IRIS_CENTER,
      LANDMARKS.LEFT_EYE_INNER,
      LANDMARKS.LEFT_EYE_OUTER,
      LANDMARKS.LEFT_EYE_TOP,
      LANDMARKS.LEFT_EYE_BOTTOM,
    );

    expect(ratio.x).toBeCloseTo(0.5, 1);
    expect(ratio.y).toBeCloseTo(0.5, 1);
  });

  it('returns ratio < 0.5 when iris is shifted toward inner corner', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.LEFT_IRIS_CENTER]: { x: 0.40, y: 0.44 },
    });
    const ratio = getIrisRatio(
      landmarks,
      LANDMARKS.LEFT_IRIS_CENTER,
      LANDMARKS.LEFT_EYE_INNER,
      LANDMARKS.LEFT_EYE_OUTER,
      LANDMARKS.LEFT_EYE_TOP,
      LANDMARKS.LEFT_EYE_BOTTOM,
    );

    expect(ratio.x).toBeLessThan(0.3);
  });

  it('returns ratio > 0.5 when iris is shifted toward outer corner', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.LEFT_IRIS_CENTER]: { x: 0.34, y: 0.44 },
    });
    const ratio = getIrisRatio(
      landmarks,
      LANDMARKS.LEFT_IRIS_CENTER,
      LANDMARKS.LEFT_EYE_INNER,
      LANDMARKS.LEFT_EYE_OUTER,
      LANDMARKS.LEFT_EYE_TOP,
      LANDMARKS.LEFT_EYE_BOTTOM,
    );

    expect(ratio.x).toBeGreaterThan(0.7);
  });

  it('returns {0.5, 0.5} when eye is too small (closed)', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.LEFT_EYE_INNER]:  { x: 0.370, y: 0.44 },
      [LANDMARKS.LEFT_EYE_OUTER]:  { x: 0.370, y: 0.44 },
    });
    const ratio = getIrisRatio(
      landmarks,
      LANDMARKS.LEFT_IRIS_CENTER,
      LANDMARKS.LEFT_EYE_INNER,
      LANDMARKS.LEFT_EYE_OUTER,
      LANDMARKS.LEFT_EYE_TOP,
      LANDMARKS.LEFT_EYE_BOTTOM,
    );

    expect(ratio.x).toBe(0.5);
    expect(ratio.y).toBe(0.5);
  });
});

// ─── computeEyeContact ──────────────────────────────────────────────

describe('computeEyeContact', () => {
  it('detects eye contact when looking straight at camera', () => {
    const landmarks = makeLandmarks();
    const result = computeEyeContact(landmarks);

    expect(result.eyeContact).toBe(true);
    expect(Math.abs(result.gazeVector.x)).toBeLessThan(0.1);
    expect(Math.abs(result.gazeVector.y)).toBeLessThan(0.1);
  });

  it('detects NO eye contact when both irises are shifted far left (looking away)', () => {
    const landmarks = makeLandmarks({
      // Both eyes looking hard left: left iris toward outer corner, right iris toward inner
      [LANDMARKS.LEFT_IRIS_CENTER]:  { x: 0.32, y: 0.44 },
      [LANDMARKS.RIGHT_IRIS_CENTER]: { x: 0.58, y: 0.44 },
    });
    const result = computeEyeContact(landmarks);

    expect(result.eyeContact).toBe(false);
  });

  it('detects eye contact when head is turned slightly right but eyes compensate', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.NOSE_TIP]: { x: 0.55, y: 0.55 },
      [LANDMARKS.LEFT_IRIS_CENTER]:  { x: 0.39, y: 0.44 },
      [LANDMARKS.RIGHT_IRIS_CENTER]: { x: 0.61, y: 0.44 },
    });
    const result = computeEyeContact(landmarks);

    expect(result.eyeContact).toBe(true);
  });

  it('detects NO eye contact when head is turned far right (beyond tolerance)', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.NOSE_TIP]: { x: 0.62, y: 0.55 },
      [LANDMARKS.LEFT_IRIS_CENTER]:  { x: 0.40, y: 0.44 },
      [LANDMARKS.RIGHT_IRIS_CENTER]: { x: 0.60, y: 0.44 },
    });
    const result = computeEyeContact(landmarks);

    expect(result.eyeContact).toBe(false);
  });

  it('detects NO eye contact when head is turned AND eyes also look away', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.NOSE_TIP]: { x: 0.54, y: 0.55 },
      // Head turned right AND eyes also looking right (not compensating)
      [LANDMARKS.LEFT_IRIS_CENTER]:  { x: 0.41, y: 0.44 },
      [LANDMARKS.RIGHT_IRIS_CENTER]: { x: 0.67, y: 0.44 },
    });
    const result = computeEyeContact(landmarks);

    expect(result.eyeContact).toBe(false);
  });

  it('returns headPose and irisDeviation in the result', () => {
    const landmarks = makeLandmarks();
    const result = computeEyeContact(landmarks);

    expect(result).toHaveProperty('headPose');
    expect(result.headPose).toHaveProperty('yaw');
    expect(result.headPose).toHaveProperty('pitch');
    expect(result).toHaveProperty('irisDeviation');
    expect(result.irisDeviation).toHaveProperty('x');
    expect(result.irisDeviation).toHaveProperty('y');
  });

  it('returns eyeContact: null when blinking (eyes nearly closed)', () => {
    const landmarks = makeLandmarks({
      // Squish eye height to near zero to simulate blink
      [LANDMARKS.LEFT_EYE_TOP]:    { x: 0.37, y: 0.439 },
      [LANDMARKS.LEFT_EYE_BOTTOM]: { x: 0.37, y: 0.441 },
    });
    const result = computeEyeContact(landmarks);

    expect(result.eyeContact).toBeNull();
    expect(result.blinking).toBe(true);
  });

  it('does NOT treat open eyes as blink', () => {
    const landmarks = makeLandmarks();
    const result = computeEyeContact(landmarks);

    expect(result.eyeContact).not.toBeNull();
    expect(result.blinking).toBe(false);
  });

  it('returns a gazeConfidence score between 0 and 1', () => {
    const landmarks = makeLandmarks();
    const result = computeEyeContact(landmarks);

    expect(result.gazeConfidence).toBeGreaterThanOrEqual(0);
    expect(result.gazeConfidence).toBeLessThanOrEqual(1);
  });
});

// ─── computeEyeContact with calibration model ──────────────────────

describe('computeEyeContact with calibration model', () => {
  // Build a simple calibration model where centered gaze maps to screen center
  function makeCalibrationModel() {
    // coeffX: screenX = 50 (constant) — any gaze maps to center
    // coeffY: screenY = 50 (constant)
    return {
      coeffX: [50, 0, 0, 0, 0],
      coeffY: [50, 0, 0, 0, 0],
      rmseX: 5,
      rmseY: 5,
      numSamples: 25,
    };
  }

  // Model that maps gaze far off screen
  function makeOffScreenModel() {
    return {
      coeffX: [200, 0, 0, 0, 0],  // predicted X = 200 (far outside 0-100)
      coeffY: [200, 0, 0, 0, 0],
      rmseX: 5,
      rmseY: 5,
      numSamples: 25,
    };
  }

  it('detects eye contact when model predicts on-screen', () => {
    const model = makeCalibrationModel();
    const result = computeEyeContact(makeLandmarks(), model);

    expect(result.eyeContact).toBe(true);
    expect(result.gazeConfidence).toBeGreaterThan(0.5);
    expect(result.screenPos).toBeDefined();
  });

  it('detects NO eye contact when model predicts off-screen', () => {
    const model = makeOffScreenModel();
    const result = computeEyeContact(makeLandmarks(), model);

    expect(result.eyeContact).toBe(false);
    expect(result.gazeConfidence).toBeLessThan(0.5);
  });

  it('still returns null for blinks even with calibration model', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.LEFT_EYE_TOP]:    { x: 0.37, y: 0.439 },
      [LANDMARKS.LEFT_EYE_BOTTOM]: { x: 0.37, y: 0.441 },
    });
    const model = makeCalibrationModel();

    const result = computeEyeContact(landmarks, model);
    expect(result.eyeContact).toBeNull();
    expect(result.blinking).toBe(true);
  });

  it('uses fallback mode when model is null', () => {
    const landmarks = makeLandmarks();
    const withModel = computeEyeContact(landmarks, null);
    const withoutModel = computeEyeContact(landmarks);

    expect(withModel.eyeContact).toBe(withoutModel.eyeContact);
  });
});

// ─── getEyeAspectRatio ──────────────────────────────────────────────

describe('getEyeAspectRatio', () => {
  it('returns a reasonable ratio for open eyes', () => {
    const landmarks = makeLandmarks();
    const ear = getEyeAspectRatio(
      landmarks, LANDMARKS.LEFT_EYE_INNER, LANDMARKS.LEFT_EYE_OUTER, LANDMARKS.LEFT_EYE_TOP, LANDMARKS.LEFT_EYE_BOTTOM
    );
    // Eye height 0.04, width 0.10 → ratio ~0.4
    expect(ear).toBeGreaterThan(0.2);
  });

  it('returns a low ratio for nearly closed eyes', () => {
    const landmarks = makeLandmarks({
      [LANDMARKS.LEFT_EYE_TOP]:    { x: 0.37, y: 0.439 },
      [LANDMARKS.LEFT_EYE_BOTTOM]: { x: 0.37, y: 0.441 },
    });
    const ear = getEyeAspectRatio(
      landmarks, LANDMARKS.LEFT_EYE_INNER, LANDMARKS.LEFT_EYE_OUTER, LANDMARKS.LEFT_EYE_TOP, LANDMARKS.LEFT_EYE_BOTTOM
    );
    expect(ear).toBeLessThan(0.2);
  });
});

// ─── calculateGazeScore ─────────────────────────────────────────────

describe('calculateGazeScore', () => {
  it('returns 0 for empty buffer', () => {
    expect(calculateGazeScore([])).toBe(0);
  });

  it('returns 100 when all frames have eye contact', () => {
    const buffer = Array.from({ length: 15 }, (_, i) => ({
      timestamp: 1000 + i * 66,
      eyeContact: true,
    }));
    expect(calculateGazeScore(buffer)).toBe(100);
  });

  it('returns 0 when no frames have eye contact', () => {
    const buffer = Array.from({ length: 15 }, (_, i) => ({
      timestamp: 1000 + i * 66,
      eyeContact: false,
    }));
    expect(calculateGazeScore(buffer)).toBe(0);
  });

  it('returns correct percentage for mixed buffer', () => {
    const buffer = [
      ...Array.from({ length: 7 }, (_, i) => ({ timestamp: i, eyeContact: true })),
      ...Array.from({ length: 3 }, (_, i) => ({ timestamp: 7 + i, eyeContact: false })),
    ];
    expect(calculateGazeScore(buffer)).toBe(70);
  });

  it('rounds to nearest integer', () => {
    const buffer = [
      { timestamp: 0, eyeContact: true },
      { timestamp: 1, eyeContact: false },
      { timestamp: 2, eyeContact: false },
    ];
    expect(calculateGazeScore(buffer)).toBe(33);
  });

  it('skips blink frames (eyeContact: null) when calculating score', () => {
    const buffer = [
      { timestamp: 0, eyeContact: true },
      { timestamp: 1, eyeContact: true },
      { timestamp: 2, eyeContact: null },  // blink
      { timestamp: 3, eyeContact: null },  // blink
      { timestamp: 4, eyeContact: true },
    ];
    // 3 true out of 3 scorable (2 blinks skipped) = 100%
    expect(calculateGazeScore(buffer)).toBe(100);
  });

  it('returns 0 when all frames are blinks', () => {
    const buffer = [
      { timestamp: 0, eyeContact: null },
      { timestamp: 1, eyeContact: null },
    ];
    expect(calculateGazeScore(buffer)).toBe(0);
  });
});

// ─── trimBuffer ─────────────────────────────────────────────────────

describe('trimBuffer', () => {
  it('keeps entries within the time window', () => {
    const now = 50000;
    const buffer = [
      { timestamp: 10000, eyeContact: true },
      { timestamp: 25000, eyeContact: false },
      { timestamp: 40000, eyeContact: true },
      { timestamp: 49000, eyeContact: true },
    ];
    const trimmed = trimBuffer(buffer, 30000, now);

    expect(trimmed).toHaveLength(3);
    expect(trimmed[0].timestamp).toBe(25000);
  });

  it('returns empty array when all entries are expired', () => {
    const buffer = [
      { timestamp: 1000, eyeContact: true },
      { timestamp: 2000, eyeContact: false },
    ];
    const trimmed = trimBuffer(buffer, 5000, 100000);

    expect(trimmed).toHaveLength(0);
  });

  it('keeps all entries when none are expired', () => {
    const now = 5000;
    const buffer = [
      { timestamp: 3000, eyeContact: true },
      { timestamp: 4000, eyeContact: false },
      { timestamp: 4500, eyeContact: true },
    ];
    const trimmed = trimBuffer(buffer, 30000, now);

    expect(trimmed).toHaveLength(3);
  });
});
