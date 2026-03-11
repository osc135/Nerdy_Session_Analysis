// useMediaPipe.js — Face mesh + gaze estimation via blendshapes
//
// Uses MediaPipe Face Landmarker with blendshapes enabled.
// Eye gaze direction comes from neural-network-trained blendshape scores
// (eyeLookUp/Down/In/Out) rather than geometric iris-ratio calculations.
// Head pose is still estimated from landmarks for nudge engine use.

import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Landmark indices (still needed for head pose)
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

// Blendshape names for gaze detection
const GAZE_BLENDSHAPES = {
  lookUpLeft: 'eyeLookUpLeft',
  lookUpRight: 'eyeLookUpRight',
  lookDownLeft: 'eyeLookDownLeft',
  lookDownRight: 'eyeLookDownRight',
  lookInLeft: 'eyeLookInLeft',
  lookInRight: 'eyeLookInRight',
  lookOutLeft: 'eyeLookOutLeft',
  lookOutRight: 'eyeLookOutRight',
  blinkLeft: 'eyeBlinkLeft',
  blinkRight: 'eyeBlinkRight',
};

export const THRESHOLDS = {
  // Blendshape-based: how much "looking away" is tolerated before losing contact
  GAZE_AWAY_THRESHOLD: 0.35,
  HEAD_YAW_TOLERANCE: 20,
  HEAD_PITCH_TOLERANCE: 18,
  BLINK_THRESHOLD: 0.55,
  BLINK_EAR_THRESHOLD: 0.2, // kept for test compatibility
};

const ROLLING_WINDOW_MS = 30000;
const ANALYSIS_FPS = 15;
const LIVE_WINDOW_MS = 1000;
const EMA_ALPHA = 0.4;

/**
 * Estimate head yaw and pitch from face landmarks.
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
 * Extract a blendshape score by name from MediaPipe results.
 */
function getBlendshape(blendshapes, name) {
  if (!blendshapes || !blendshapes[0]?.categories) return 0;
  const cat = blendshapes[0].categories.find(c => c.categoryName === name);
  return cat ? cat.score : 0;
}

/**
 * Compute eye contact using blendshapes (neural network gaze direction).
 *
 * "Looking at camera" = all directional blendshapes are low.
 * When any direction score exceeds the threshold, confidence drops.
 *
 * @returns { eyeContact, gazeConfidence, headPose, blinking, gazeDir }
 */
export function computeEyeContact(landmarks, blendshapes = null) {
  const headPose = estimateHeadPose(landmarks);

  // ─── Blendshape mode (preferred) ───
  if (blendshapes && blendshapes[0]?.categories) {
    const blinkL = getBlendshape(blendshapes, GAZE_BLENDSHAPES.blinkLeft);
    const blinkR = getBlendshape(blendshapes, GAZE_BLENDSHAPES.blinkRight);
    const blinking = blinkL > THRESHOLDS.BLINK_THRESHOLD && blinkR > THRESHOLDS.BLINK_THRESHOLD;

    if (blinking) {
      return {
        eyeContact: null,
        gazeConfidence: null,
        gazeVector: { x: 0, y: 0 },
        headPose,
        blinking: true,
      };
    }

    // Get directional gaze scores (0 = looking straight, 1 = fully in that direction)
    const upL = getBlendshape(blendshapes, GAZE_BLENDSHAPES.lookUpLeft);
    const upR = getBlendshape(blendshapes, GAZE_BLENDSHAPES.lookUpRight);
    const downL = getBlendshape(blendshapes, GAZE_BLENDSHAPES.lookDownLeft);
    const downR = getBlendshape(blendshapes, GAZE_BLENDSHAPES.lookDownRight);
    const inL = getBlendshape(blendshapes, GAZE_BLENDSHAPES.lookInLeft);
    const inR = getBlendshape(blendshapes, GAZE_BLENDSHAPES.lookInRight);
    const outL = getBlendshape(blendshapes, GAZE_BLENDSHAPES.lookOutLeft);
    const outR = getBlendshape(blendshapes, GAZE_BLENDSHAPES.lookOutRight);

    // Average each direction across both eyes
    const up = (upL + upR) / 2;
    const down = (downL + downR) / 2;
    const sideways = Math.max((inL + outR) / 2, (outL + inR) / 2); // net lateral
    const vertical = Math.max(up, down);

    // The max "looking away" signal across all directions
    const maxAway = Math.max(up, down, inL, inR, outL, outR);

    // Head pose penalty
    const yawOver = Math.max(0, Math.abs(headPose.yaw) - THRESHOLDS.HEAD_YAW_TOLERANCE);
    const pitchOver = Math.max(0, Math.abs(headPose.pitch) - THRESHOLDS.HEAD_PITCH_TOLERANCE);
    const headPenalty = Math.exp(-(yawOver ** 2) / 200 - (pitchOver ** 2) / 128);

    // Confidence: 1 when all directions are 0, drops as any direction increases
    // Using quadratic falloff for a smooth curve
    const gazeConfidence = Math.max(0, Math.min(1,
      (1 - maxAway * 1.8) * headPenalty
    ));

    const eyeContact = gazeConfidence > 0.5;

    return {
      eyeContact,
      gazeConfidence,
      gazeVector: { x: sideways, y: vertical },
      headPose,
      blinking: false,
      gazeDir: { up, down, sideways, maxAway },
    };
  }

  // ─── Fallback: landmark-based (no blendshapes available) ───
  return computeEyeContactFallback(landmarks, headPose);
}

/**
 * Fallback gaze detection using iris landmarks (for when blendshapes aren't available).
 */
function computeEyeContactFallback(landmarks, headPose) {
  const L = LANDMARKS;

  const leftEAR = getEyeAspectRatio(landmarks, L.LEFT_EYE_INNER, L.LEFT_EYE_OUTER, L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
  const rightEAR = getEyeAspectRatio(landmarks, L.RIGHT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);
  if (leftEAR < THRESHOLDS.BLINK_EAR_THRESHOLD || rightEAR < THRESHOLDS.BLINK_EAR_THRESHOLD) {
    return {
      eyeContact: null,
      gazeConfidence: null,
      gazeVector: { x: 0, y: 0 },
      headPose,
      blinking: true,
    };
  }

  const iris = getWeightedIrisPosition(landmarks, headPose.yaw);
  const irisX = iris.x;
  const irisY = iris.y;

  const expectedIrisOffsetX = headPose.yaw / 90 * 0.25;
  const expectedIrisOffsetY = headPose.pitch / 90 * 0.2;

  const compensatedX = Math.abs((irisX - 0.5) - expectedIrisOffsetX);
  const compensatedY = Math.abs((irisY - 0.5) - expectedIrisOffsetY);

  const headInRange =
    Math.abs(headPose.yaw) < THRESHOLDS.HEAD_YAW_TOLERANCE &&
    Math.abs(headPose.pitch) < THRESHOLDS.HEAD_PITCH_TOLERANCE;

  const tolX = 0.12;
  const tolY = 0.13;
  const sigmaX = tolX * 0.8;
  const sigmaY = tolY * 0.8;
  const irisConfidence = Math.exp(
    -(compensatedX ** 2) / (2 * sigmaX ** 2)
    - (compensatedY ** 2) / (2 * sigmaY ** 2)
  );

  const yawOver = Math.max(0, Math.abs(headPose.yaw) - THRESHOLDS.HEAD_YAW_TOLERANCE);
  const pitchOver = Math.max(0, Math.abs(headPose.pitch) - THRESHOLDS.HEAD_PITCH_TOLERANCE);
  const headPenalty = Math.exp(-(yawOver ** 2) / 200 - (pitchOver ** 2) / 128);

  const gazeConfidence = Math.max(0, Math.min(1, irisConfidence * headPenalty));
  const eyeContact = headInRange && compensatedX < tolX && compensatedY < tolY;

  return {
    eyeContact,
    gazeConfidence,
    gazeVector: { x: irisX - 0.5, y: irisY - 0.5 },
    headPose,
    irisDeviation: { x: compensatedX, y: compensatedY },
    blinking: false,
  };
}

// ─── Legacy exports (used by tests and CalibrationScreen) ───────────

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

export function getWeightedIrisPosition(landmarks, headYaw) {
  const L = LANDMARKS;
  const leftIris = getIrisRatio(landmarks, L.LEFT_IRIS_CENTER, L.LEFT_EYE_INNER, L.LEFT_EYE_OUTER, L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
  const rightIris = getIrisRatio(landmarks, L.RIGHT_IRIS_CENTER, L.RIGHT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);

  const leftX = 1 - leftIris.x;
  const rightX = rightIris.x;

  const absYaw = Math.abs(headYaw);
  let leftWeight = 0.5, rightWeight = 0.5;

  if (absYaw >= 10) {
    const t = Math.min((absYaw - 10) / 20, 1);
    if (headYaw > 0) {
      rightWeight = 0.5 + t * 0.3;
      leftWeight = 1 - rightWeight;
    } else {
      leftWeight = 0.5 + t * 0.3;
      rightWeight = 1 - leftWeight;
    }
  }

  return {
    x: leftX * leftWeight + rightX * rightWeight,
    y: leftIris.y * leftWeight + rightIris.y * rightWeight,
  };
}

export function extractGaze(landmarks) {
  const L = LANDMARKS;
  const leftEAR = getEyeAspectRatio(landmarks, L.LEFT_EYE_INNER, L.LEFT_EYE_OUTER, L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
  const rightEAR = getEyeAspectRatio(landmarks, L.RIGHT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);
  if (leftEAR < THRESHOLDS.BLINK_EAR_THRESHOLD || rightEAR < THRESHOLDS.BLINK_EAR_THRESHOLD) return null;

  const headPose = estimateHeadPose(landmarks);
  const iris = getWeightedIrisPosition(landmarks, headPose.yaw);
  return { irisX: iris.x, irisY: iris.y, headPose };
}

/**
 * Calculate eye contact percentage from a buffer of frame results.
 */
export function calculateGazeScore(frameBuffer) {
  const scorable = frameBuffer.filter(f => f.eyeContact !== null);
  if (scorable.length === 0) return 0;

  if (scorable[0].gazeConfidence != null) {
    const avg = scorable.reduce((sum, f) => sum + (f.gazeConfidence || 0), 0) / scorable.length;
    return Math.round(avg * 100);
  }

  const contactFrames = scorable.filter(f => f.eyeContact).length;
  return Math.round((contactFrames / scorable.length) * 100);
}

export function trimBuffer(buffer, windowMs, now = Date.now()) {
  const cutoff = now - windowMs;
  return buffer.filter(f => f.timestamp >= cutoff);
}

// ─── React Hook ──────────────────────────────────────────────────────

export function useMediaPipe(videoRef, sessionId = null) {
  const [gazeScore, setGazeScore] = useState(0);
  const [energyScore, setEnergyScore] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [gazeDebug, setGazeDebug] = useState(null);

  const frameBufferRef = useRef([]);
  const sessionHistoryRef = useRef([]);
  const faceLandmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastProcessTimeRef = useRef(0);

  // EMA-smoothed confidence for stability
  const smoothedConfRef = useRef(null);

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
        const gazeResult = computeEyeContact(landmarks, results.faceBlendshapes);

        // Smooth the confidence value
        const rawConf = gazeResult.gazeConfidence;
        if (rawConf != null) {
          if (smoothedConfRef.current != null) {
            smoothedConfRef.current += EMA_ALPHA * (rawConf - smoothedConfRef.current);
          } else {
            smoothedConfRef.current = rawConf;
          }
        }

        const smoothedConf = smoothedConfRef.current ?? rawConf;

        frameData = {
          timestamp: now,
          eyeContact: gazeResult.eyeContact,
          gazeConfidence: smoothedConf,
          gazeVector: gazeResult.gazeVector,
          headPose: gazeResult.headPose,
        };

        setGazeDebug({
          yaw: gazeResult.headPose.yaw.toFixed(1),
          pitch: gazeResult.headPose.pitch.toFixed(1),
          confidence: (smoothedConf ?? 0).toFixed(2),
          rawConf: (rawConf ?? 0).toFixed(2),
          contact: gazeResult.eyeContact ? 'Y' : 'N',
          maxAway: gazeResult.gazeDir?.maxAway?.toFixed(2) ?? '-',
          mode: gazeResult.gazeDir ? 'blendshape' : 'fallback',
        });
      } else {
        frameData = {
          timestamp: now,
          eyeContact: false,
          gazeConfidence: 0,
          gazeVector: { x: 0, y: 0 },
          headPose: { yaw: 0, pitch: 0 },
        };
      }

      sessionHistoryRef.current.push(frameData);
      frameBufferRef.current.push(frameData);
      frameBufferRef.current = trimBuffer(frameBufferRef.current, ROLLING_WINDOW_MS);

      const recentFrames = trimBuffer(frameBufferRef.current, LIVE_WINDOW_MS, now);
      setGazeScore(calculateGazeScore(recentFrames));
    } catch (err) {
      // skip bad frames
    }
  }, [videoRef]);

  const runLoop = useCallback((timestamp) => {
    processFrame(timestamp);
    animFrameRef.current = requestAnimationFrame(runLoop);
  }, [processFrame]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const createLandmarker = async (delegate) => {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        return FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate,
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
      };

      try {
        const landmarker = await createLandmarker('GPU');
        if (cancelled) return;
        faceLandmarkerRef.current = landmarker;
        setIsReady(true);
      } catch (err) {
        console.error('MediaPipe GPU init failed:', err);
        try {
          const landmarker = await createLandmarker('CPU');
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

  return { gazeScore, energyScore, isReady, getSessionHistory, gazeDebug };
}
