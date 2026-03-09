// useMediaPipe.js — Face mesh + gaze estimation with head pose compensation
// Analyzes every frame MediaPipe processes (~10-15fps), stores per-frame results,
// and reports a rolling eye contact percentage at 1Hz to the UI.

import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Landmark indices for gaze calculation
export const LANDMARKS = {
  LEFT_IRIS_CENTER: 468,
  RIGHT_IRIS_CENTER: 473,
  LEFT_EYE_INNER: 133,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  NOSE_TIP: 1,
  CHIN: 152,
  LEFT_EYE_LEFT_CORNER: 33,
  RIGHT_EYE_RIGHT_CORNER: 263,
  LEFT_MOUTH_CORNER: 61,
  RIGHT_MOUTH_CORNER: 291,
};

// Thresholds for "looking at camera"
export const THRESHOLDS = {
  IRIS_CENTER_TOLERANCE_X: 0.18,
  IRIS_CENTER_TOLERANCE_Y: 0.22,
  HEAD_YAW_TOLERANCE: 25,
  HEAD_PITCH_TOLERANCE: 20,
  BLINK_EAR_THRESHOLD: 0.2, // eye aspect ratio below this = blink
};

const ROLLING_WINDOW_MS = 30000; // 30-second window for session history buffer
const ANALYSIS_FPS = 15;         // Target analysis framerate
const LIVE_WINDOW_MS = 1000;     // 1-second window for live score (instant feel)

/**
 * Estimate head yaw and pitch from face landmarks.
 * Yaw: positive = head turned right. Pitch: positive = head tilted down.
 */
export function estimateHeadPose(landmarks) {
  const leftEye = landmarks[LANDMARKS.LEFT_EYE_LEFT_CORNER];
  const rightEye = landmarks[LANDMARKS.RIGHT_EYE_RIGHT_CORNER];
  const nose = landmarks[LANDMARKS.NOSE_TIP];
  const chin = landmarks[LANDMARKS.CHIN];

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeSpan = Math.abs(rightEye.x - leftEye.x);

  const yawRatio = (nose.x - eyeMidX) / (eyeSpan || 0.001);
  const yawDeg = yawRatio * 90;

  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const faceHeight = Math.abs(chin.y - eyeMidY);
  const pitchRatio = (nose.y - eyeMidY) / (faceHeight || 0.001);
  const pitchDeg = (pitchRatio - 0.35) * 120;

  return { yaw: yawDeg, pitch: pitchDeg };
}

/**
 * Calculate where the iris center sits within the eye opening.
 * Returns {x, y} where 0.5 = centered (looking straight).
 */
export function getIrisRatio(landmarks, irisCenter, innerCorner, outerCorner, topLid, bottomLid) {
  const iris = landmarks[irisCenter];
  const inner = landmarks[innerCorner];
  const outer = landmarks[outerCorner];
  const top = landmarks[topLid];
  const bottom = landmarks[bottomLid];

  const eyeWidth = Math.sqrt((outer.x - inner.x) ** 2 + (outer.y - inner.y) ** 2);
  const eyeHeight = Math.sqrt((bottom.x - top.x) ** 2 + (bottom.y - top.y) ** 2);

  if (eyeWidth < 0.001 || eyeHeight < 0.001) return { x: 0.5, y: 0.5 };

  const dx = outer.x - inner.x;
  const dy = outer.y - inner.y;
  const t = ((iris.x - inner.x) * dx + (iris.y - inner.y) * dy) / (dx * dx + dy * dy);

  const vdx = bottom.x - top.x;
  const vdy = bottom.y - top.y;
  const vt = ((iris.x - top.x) * vdx + (iris.y - top.y) * vdy) / (vdx * vdx + vdy * vdy);

  return { x: t, y: vt };
}

/**
 * Calculate eye aspect ratio (EAR) — low value means eye is closing/blinking.
 * EAR = eye height / eye width. Open eye ≈ 0.3-0.5, blink ≈ 0.05-0.15.
 */
export function getEyeAspectRatio(landmarks, innerCorner, outerCorner, topLid, bottomLid) {
  const inner = landmarks[innerCorner];
  const outer = landmarks[outerCorner];
  const top = landmarks[topLid];
  const bottom = landmarks[bottomLid];

  const width = Math.sqrt((outer.x - inner.x) ** 2 + (outer.y - inner.y) ** 2);
  const height = Math.sqrt((bottom.x - top.x) ** 2 + (bottom.y - top.y) ** 2);

  if (width < 0.001) return 0;
  return height / width;
}

/**
 * Extract the normalized gaze position from landmarks.
 * Returns { irisX, irisY } in gaze-space, plus headPose.
 * Returns null if blinking.
 */
export function extractGaze(landmarks) {
  const L = LANDMARKS;

  // Check for blinks
  const leftEAR = getEyeAspectRatio(landmarks, L.LEFT_EYE_INNER, L.LEFT_EYE_OUTER, L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
  const rightEAR = getEyeAspectRatio(landmarks, L.RIGHT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);
  const blinking = leftEAR < THRESHOLDS.BLINK_EAR_THRESHOLD || rightEAR < THRESHOLDS.BLINK_EAR_THRESHOLD;

  if (blinking) return null;

  const leftIris = getIrisRatio(
    landmarks, L.LEFT_IRIS_CENTER, L.LEFT_EYE_INNER, L.LEFT_EYE_OUTER, L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM
  );
  const rightIris = getIrisRatio(
    landmarks, L.RIGHT_IRIS_CENTER, L.RIGHT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM
  );

  // Flip left eye x-ratio so both eyes use the same direction convention.
  const leftIrisXNormalized = 1 - leftIris.x;
  const irisX = (leftIrisXNormalized + rightIris.x) / 2;
  const irisY = (leftIris.y + rightIris.y) / 2;
  const headPose = estimateHeadPose(landmarks);

  return { irisX, irisY, headPose };
}

/**
 * Determine if a set of landmarks represents visual engagement (looking at screen).
 * Uses calibration screen bounds if available, falls back to hardcoded tolerances.
 * Returns eyeContact: null if blinking (frame should be skipped).
 *
 * @param landmarks - MediaPipe face landmarks
 * @param screenBounds - optional calibration data { minX, maxX, minY, maxY, headYawRange, headPitchRange }
 */
export function computeEyeContact(landmarks, screenBounds = null) {
  const gaze = extractGaze(landmarks);

  if (!gaze) {
    return {
      eyeContact: null,
      gazeVector: { x: 0, y: 0 },
      headPose: estimateHeadPose(landmarks),
      irisDeviation: { x: 0, y: 0 },
      blinking: true,
    };
  }

  const { irisX, irisY, headPose } = gaze;

  if (screenBounds) {
    // Calibrated mode: check if gaze falls within the measured screen bounds
    const onScreenX = irisX >= screenBounds.minX && irisX <= screenBounds.maxX;
    const onScreenY = irisY >= screenBounds.minY && irisY <= screenBounds.maxY;
    const headInRange =
      headPose.yaw >= screenBounds.headYawRange.min &&
      headPose.yaw <= screenBounds.headYawRange.max &&
      headPose.pitch >= screenBounds.headPitchRange.min &&
      headPose.pitch <= screenBounds.headPitchRange.max;

    const eyeContact = onScreenX && onScreenY && headInRange;

    return {
      eyeContact,
      gazeVector: { x: irisX - 0.5, y: irisY - 0.5 },
      headPose,
      irisDeviation: { x: onScreenX ? 0 : Math.min(Math.abs(irisX - screenBounds.minX), Math.abs(irisX - screenBounds.maxX)), y: onScreenY ? 0 : Math.min(Math.abs(irisY - screenBounds.minY), Math.abs(irisY - screenBounds.maxY)) },
    };
  }

  // Fallback: no calibration — use hardcoded tolerance from center
  const expectedIrisOffsetX = -headPose.yaw / 90 * 0.3;
  const expectedIrisOffsetY = -headPose.pitch / 90 * 0.3;

  const compensatedX = Math.abs((irisX - 0.5) - expectedIrisOffsetX);
  const compensatedY = Math.abs((irisY - 0.5) - expectedIrisOffsetY);

  const headInRange =
    Math.abs(headPose.yaw) < THRESHOLDS.HEAD_YAW_TOLERANCE &&
    Math.abs(headPose.pitch) < THRESHOLDS.HEAD_PITCH_TOLERANCE;

  const eyeContact = headInRange &&
    compensatedX < THRESHOLDS.IRIS_CENTER_TOLERANCE_X &&
    compensatedY < THRESHOLDS.IRIS_CENTER_TOLERANCE_Y;

  return {
    eyeContact,
    gazeVector: { x: irisX - 0.5, y: irisY - 0.5 },
    headPose,
    irisDeviation: { x: compensatedX, y: compensatedY },
  };
}

/**
 * Calculate eye contact percentage from a buffer of frame results.
 */
export function calculateGazeScore(frameBuffer) {
  // Filter out blink frames (eyeContact === null) — they shouldn't count for or against
  const scorableFrames = frameBuffer.filter(f => f.eyeContact !== null);
  if (scorableFrames.length === 0) return 0;
  const contactFrames = scorableFrames.filter(f => f.eyeContact).length;
  return Math.round((contactFrames / scorableFrames.length) * 100);
}

/**
 * Trim a frame buffer to only include entries within a time window.
 */
export function trimBuffer(buffer, windowMs, now = Date.now()) {
  const cutoff = now - windowMs;
  return buffer.filter(f => f.timestamp >= cutoff);
}

// ─── React Hook ──────────────────────────────────────────────────────

export function useMediaPipe(videoRef, sessionId = null) {
  const [gazeScore, setGazeScore] = useState(0);
  const [energyScore, setEnergyScore] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const frameBufferRef = useRef([]);
  const sessionHistoryRef = useRef([]);
  const faceLandmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastProcessTimeRef = useRef(0);
  const screenBoundsRef = useRef(null);

  // Eye contact detection uses fallback mode (hardcoded tolerances with head-pose compensation)

  const processFrame = useCallback((timestamp) => {
    const video = videoRef?.current;
    const faceLandmarker = faceLandmarkerRef.current;

    if (!video || !faceLandmarker || video.readyState < 2) return;

    const elapsed = timestamp - lastProcessTimeRef.current;
    if (elapsed < 1000 / ANALYSIS_FPS) return;
    lastProcessTimeRef.current = timestamp;

    try {
      const results = faceLandmarker.detectForVideo(video, timestamp);

      const now = Date.now();
      let frameData;

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        const gazeResult = computeEyeContact(landmarks, screenBoundsRef.current);

        frameData = {
          timestamp: now,
          eyeContact: gazeResult.eyeContact,
          gazeVector: gazeResult.gazeVector,
          headPose: gazeResult.headPose,
        };
      } else {
        // No face detected — count as not making eye contact
        frameData = {
          timestamp: now,
          eyeContact: false,
          gazeVector: { x: 0, y: 0 },
          headPose: { yaw: 0, pitch: 0 },
        };
      }

      sessionHistoryRef.current.push(frameData);
      frameBufferRef.current.push(frameData);
      frameBufferRef.current = trimBuffer(frameBufferRef.current, ROLLING_WINDOW_MS);

      // Live score: use only the last ~1 second of frames for instant feedback
      const recentFrames = trimBuffer(frameBufferRef.current, LIVE_WINDOW_MS, now);
      setGazeScore(calculateGazeScore(recentFrames));
    } catch (err) {
      // MediaPipe can throw on bad frames — skip silently
    }
  }, [videoRef]);

  const runLoop = useCallback((timestamp) => {
    processFrame(timestamp);
    animFrameRef.current = requestAnimationFrame(runLoop);
  }, [processFrame]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });

        if (cancelled) return;
        faceLandmarkerRef.current = landmarker;
        setIsReady(true);
      } catch (err) {
        console.error('MediaPipe init failed:', err);
        try {
          const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
          );
          const landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          });

          if (cancelled) return;
          faceLandmarkerRef.current = landmarker;
          setIsReady(true);
        } catch (cpuErr) {
          console.error('MediaPipe CPU fallback also failed:', cpuErr);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isReady || !videoRef?.current) return;

    const video = videoRef.current;

    const startLoop = () => {
      if (video.readyState >= 2) {
        animFrameRef.current = requestAnimationFrame(runLoop);
      }
    };

    if (video.readyState >= 2) {
      startLoop();
    } else {
      video.addEventListener('loadeddata', startLoop);
    }

    return () => {
      video.removeEventListener('loadeddata', startLoop);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isReady, videoRef, runLoop]);

  const getSessionHistory = useCallback(() => {
    return sessionHistoryRef.current.map(f => ({
      timestamp: f.timestamp,
      eyeContact: f.eyeContact,
    }));
  }, []);

  return { gazeScore, energyScore, isReady, getSessionHistory };
}
