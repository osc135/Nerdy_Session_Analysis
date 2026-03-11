import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { estimateHeadPose, getWeightedIrisPosition, getEyeAspectRatio, LANDMARKS, THRESHOLDS } from '../hooks/useMediaPipe';
import { buildCalibrationModel, serializeModel } from '../utils/gazeCalibration';

// 5-point calibration: 4 corners + center
const CALIBRATION_POINTS = [
  { x: 10, y: 10, label: 'top-left' },
  { x: 90, y: 10, label: 'top-right' },
  { x: 50, y: 50, label: 'center' },
  { x: 10, y: 90, label: 'bottom-left' },
  { x: 90, y: 90, label: 'bottom-right' },
];

const SAMPLES_PER_POINT = 25;
const SAMPLE_INTERVAL_MS = 60;

function CalibrationScreen() {
  const { role, sessionId } = useParams();
  const navigate = useNavigate();

  const [stream, setStream] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(-1);
  const [samplesCollected, setSamplesCollected] = useState(0);
  const [mediaPipeReady, setMediaPipeReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const calibrationDataRef = useRef([]);
  const samplingRef = useRef(null);
  const faceCheckRef = useRef(null);

  // Request camera on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!cancelled) setStream(mediaStream);
      } catch {
        if (!cancelled) setError('Camera access is required for calibration.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Initialize MediaPipe
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
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
      };

      try {
        const landmarker = await createLandmarker('GPU');
        if (cancelled) return;
        faceLandmarkerRef.current = landmarker;
        setMediaPipeReady(true);
      } catch {
        try {
          const landmarker = await createLandmarker('CPU');
          if (cancelled) return;
          faceLandmarkerRef.current = landmarker;
          setMediaPipeReady(true);
        } catch {
          if (!cancelled) setError('Failed to initialize face tracking.');
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

  // Attach stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    video.play().catch(() => {});

    const check = setInterval(() => {
      if (video.readyState >= 2) {
        setVideoReady(true);
        clearInterval(check);
      }
    }, 100);

    return () => clearInterval(check);
  }, [stream]);

  // Continuous face detection check (so user knows if their face is visible)
  useEffect(() => {
    if (!mediaPipeReady || !videoReady) return;

    faceCheckRef.current = setInterval(() => {
      const video = videoRef.current;
      const landmarker = faceLandmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      try {
        const results = landmarker.detectForVideo(video, performance.now());
        setFaceDetected(results.faceLandmarks && results.faceLandmarks.length > 0);
      } catch { /* skip */ }
    }, 300);

    return () => clearInterval(faceCheckRef.current);
  }, [mediaPipeReady, videoReady]);

  // Sample a single gaze frame
  const sampleGaze = useCallback(() => {
    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) return null;

    try {
      const results = landmarker.detectForVideo(video, performance.now());
      if (!results.faceLandmarks || results.faceLandmarks.length === 0) return null;

      const landmarks = results.faceLandmarks[0];
      const L = LANDMARKS;

      const leftEAR = getEyeAspectRatio(landmarks, L.LEFT_EYE_INNER, L.LEFT_EYE_OUTER, L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
      const rightEAR = getEyeAspectRatio(landmarks, L.RIGHT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);
      if (leftEAR < THRESHOLDS.BLINK_EAR_THRESHOLD || rightEAR < THRESHOLDS.BLINK_EAR_THRESHOLD) return null;

      const headPose = estimateHeadPose(landmarks);
      const iris = getWeightedIrisPosition(landmarks, headPose.yaw);

      return {
        irisX: iris.x,
        irisY: iris.y,
        headYaw: headPose.yaw,
        headPitch: headPose.pitch,
      };
    } catch {
      return null;
    }
  }, []);

  // Start sampling for a calibration point
  const startSampling = useCallback((pointIndex) => {
    // Stop face check during sampling to free up MediaPipe
    if (faceCheckRef.current) clearInterval(faceCheckRef.current);

    const samples = [];
    setSamplesCollected(0);

    samplingRef.current = setInterval(() => {
      const gaze = sampleGaze();
      if (gaze) {
        samples.push(gaze);
        setSamplesCollected(samples.length);
      }

      if (samples.length >= SAMPLES_PER_POINT) {
        clearInterval(samplingRef.current);
        samplingRef.current = null;

        calibrationDataRef.current[pointIndex] = {
          screenX: CALIBRATION_POINTS[pointIndex].x,
          screenY: CALIBRATION_POINTS[pointIndex].y,
          samples,
        };

        if (pointIndex < CALIBRATION_POINTS.length - 1) {
          setCalibrationStep(pointIndex + 1);
        } else {
          finishCalibration();
        }
      }
    }, SAMPLE_INTERVAL_MS);
  }, [sampleGaze]);

  useEffect(() => {
    if (calibrationStep >= 0 && calibrationStep < CALIBRATION_POINTS.length) {
      startSampling(calibrationStep);
    }
    return () => {
      if (samplingRef.current) clearInterval(samplingRef.current);
    };
  }, [calibrationStep, startSampling]);

  const finishCalibration = useCallback(() => {
    const model = buildCalibrationModel(calibrationDataRef.current);

    if (model) {
      sessionStorage.setItem(`calibration_${sessionId}`, serializeModel(model));
      console.log('[Calibration] Model built:', model.numSamples, 'samples, RMSE:', model.rmseX.toFixed(3), model.rmseY.toFixed(3));
    } else {
      console.warn('[Calibration] Not enough data to build model, using fallback');
    }

    cleanup();
    navigate(`/${role}/${sessionId}`);
  }, [sessionId, role, navigate]);

  const handleSkip = () => {
    cleanup();
    navigate(`/${role}/${sessionId}`);
  };

  const cleanup = useCallback(() => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (faceLandmarkerRef.current) {
      faceLandmarkerRef.current.close();
      faceLandmarkerRef.current = null;
    }
  }, [stream]);

  // ─── Render ────────────────────────────────────────────────────────

  const isCalibrating = calibrationStep >= 0;
  const currentPoint = isCalibrating ? CALIBRATION_POINTS[calibrationStep] : null;
  const progress = isCalibrating ? Math.round((samplesCollected / SAMPLES_PER_POINT) * 100) : 0;

  // Determine visible content based on state
  let content;

  if (error) {
    content = (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Setup Error</h1>
          <p style={styles.text}>{error}</p>
          <button style={{ ...styles.button, ...styles.skipBtn }} onClick={handleSkip}>
            Continue Without Calibration
          </button>
        </div>
      </div>
    );
  } else if (!mediaPipeReady || !videoReady) {
    content = (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Loading Face Tracking...</h1>
          <p style={styles.textMuted}>This may take a few seconds on first load.</p>
          <div style={styles.spinner} />
          <button style={{ ...styles.button, ...styles.skipBtn, marginTop: '1.5rem' }} onClick={handleSkip}>
            Skip Calibration
          </button>
        </div>
      </div>
    );
  } else if (!isCalibrating) {
    content = (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Quick Eye Calibration</h1>
          <p style={styles.text}>
            We'll show 5 dots on screen. Look directly at each dot and hold your gaze
            for about 1.5 seconds. This trains the gaze tracker to your eyes and screen position.
          </p>

          <div style={styles.faceStatus}>
            <div style={{
              ...styles.faceIndicator,
              background: faceDetected ? '#2d7a4a' : '#8b3a3a',
            }} />
            <span style={{ color: faceDetected ? '#6ee7a0' : '#f08080' }}>
              {faceDetected ? 'Face detected — ready to calibrate' : 'Position your face in front of the camera'}
            </span>
          </div>

          <div style={styles.buttonRow}>
            <button
              style={{
                ...styles.button, ...styles.startBtn,
                opacity: faceDetected ? 1 : 0.4,
              }}
              onClick={() => setCalibrationStep(0)}
              disabled={!faceDetected}
            >
              Start Calibration
            </button>
            <button style={{ ...styles.button, ...styles.skipBtn }} onClick={handleSkip}>
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <div style={styles.calibrationFullscreen}>
        <div
          style={{
            ...styles.dot,
            left: `${currentPoint.x}%`,
            top: `${currentPoint.y}%`,
          }}
        >
          <div style={{
            ...styles.dotRing,
            transform: `scale(${1 + (progress / 100) * 0.6})`,
            opacity: 0.3 + (progress / 100) * 0.7,
          }} />
          <div style={styles.dotCenter} />
        </div>

        <div style={styles.calibrationInfo}>
          <p style={styles.calibrationText}>
            Look at the dot — <strong>{currentPoint.label}</strong>
          </p>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <p style={styles.calibrationStep}>
            Point {calibrationStep + 1} of {CALIBRATION_POINTS.length}
          </p>
        </div>
      </div>
    );
  }

  // Video element is ALWAYS rendered so the ref is stable and MediaPipe can read frames
  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline style={styles.offscreenVideo} />
      {content}
    </>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
  },
  card: {
    background: '#161b22',
    borderRadius: '12px',
    padding: '3rem',
    maxWidth: '540px',
    width: '100%',
    border: '1px solid #30363d',
    textAlign: 'center',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: '1rem',
  },
  text: {
    color: '#c9d1d9',
    fontSize: '0.95rem',
    lineHeight: 1.6,
    marginBottom: '1.5rem',
  },
  textMuted: {
    color: '#8b949e',
    fontSize: '0.85rem',
    marginBottom: '1.5rem',
  },
  faceStatus: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.6rem',
    marginBottom: '1.5rem',
    fontSize: '0.88rem',
  },
  faceIndicator: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  buttonRow: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
  },
  button: {
    padding: '0.75rem 2rem',
    borderRadius: '8px',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  startBtn: {
    background: '#238636',
    color: 'white',
  },
  skipBtn: {
    background: '#21262d',
    color: '#8b949e',
    border: '1px solid #30363d',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #30363d',
    borderTop: '3px solid #58a6ff',
    borderRadius: '50%',
    margin: '1rem auto',
    animation: 'spin 1s linear infinite',
  },
  offscreenVideo: {
    position: 'fixed',
    top: 0, left: 0,
    width: '1px', height: '1px',
    opacity: 0,
    pointerEvents: 'none',
  },
  calibrationFullscreen: {
    position: 'fixed',
    inset: 0,
    background: '#0d1117',
  },
  dot: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    width: '50px',
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCenter: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#58a6ff',
    position: 'absolute',
  },
  dotRing: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '2px solid #58a6ff',
    transition: 'transform 0.15s ease, opacity 0.15s ease',
  },
  calibrationInfo: {
    position: 'absolute',
    bottom: '10%',
    left: '50%',
    transform: 'translateX(-50%)',
    textAlign: 'center',
    width: '300px',
  },
  calibrationText: {
    color: '#c9d1d9',
    fontSize: '1.1rem',
    marginBottom: '0.75rem',
  },
  calibrationStep: {
    color: '#8b949e',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
  },
  progressTrack: {
    width: '100%',
    height: '6px',
    background: '#21262d',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#58a6ff',
    borderRadius: '3px',
    transition: 'width 0.15s ease',
  },
};

export default CalibrationScreen;
