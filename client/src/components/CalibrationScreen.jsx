import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { estimateHeadPose, getIrisRatio, getEyeAspectRatio, LANDMARKS, THRESHOLDS } from '../hooks/useMediaPipe';

// Calibration points: top-left, top-right, bottom-center of screen
const CALIBRATION_POINTS = [
  { x: 5, y: 5, label: 'top-left corner' },
  { x: 95, y: 5, label: 'top-right corner' },
  { x: 50, y: 95, label: 'bottom center' },
];

const SAMPLES_PER_POINT = 20; // collect ~20 gaze samples per calibration point
const SAMPLE_INTERVAL_MS = 80; // sample every 80ms (~1.3s per point)

function CalibrationScreen() {
  const { role, sessionId } = useParams();
  const navigate = useNavigate();

  const [cameraAllowed, setCameraAllowed] = useState(null); // null = not asked, true/false
  const [stream, setStream] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(-1); // -1 = not started
  const [samplesCollected, setSamplesCollected] = useState(0);
  const [mediaPipeReady, setMediaPipeReady] = useState(false);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const calibrationDataRef = useRef([]);
  const samplingRef = useRef(null);

  // Request camera access
  const requestCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setStream(mediaStream);
      setCameraAllowed(true);
    } catch (err) {
      setCameraAllowed(false);
      setError('Camera access is required for visual engagement tracking.');
    }
  }, []);

  // Initialize MediaPipe
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
        setMediaPipeReady(true);
      } catch (err) {
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
          setMediaPipeReady(true);
        } catch (cpuErr) {
          setError('Failed to initialize face tracking. Please try a different browser.');
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

  // Attach stream to the offscreen video element and poll until it's ready.
  // We poll because offscreen videos may not fire 'playing' in all browsers.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;

    // Poll readyState since offscreen videos may not fire events reliably
    const check = setInterval(() => {
      if (video.readyState >= 2) {
        setVideoReady(true);
        clearInterval(check);
      }
    }, 100);

    return () => clearInterval(check);
  }, [stream]);

  // Get current gaze vector from a single frame
  const sampleGaze = useCallback(() => {
    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) return null;

    try {
      const results = landmarker.detectForVideo(video, performance.now());
      if (!results.faceLandmarks || results.faceLandmarks.length === 0) return null;

      const landmarks = results.faceLandmarks[0];
      const L = LANDMARKS;

      // Skip blinks
      const leftEAR = getEyeAspectRatio(landmarks, L.LEFT_EYE_INNER, L.LEFT_EYE_OUTER, L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
      const rightEAR = getEyeAspectRatio(landmarks, L.RIGHT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);
      if (leftEAR < THRESHOLDS.BLINK_EAR_THRESHOLD || rightEAR < THRESHOLDS.BLINK_EAR_THRESHOLD) return null;

      const leftIris = getIrisRatio(landmarks, L.LEFT_IRIS_CENTER, L.LEFT_EYE_INNER, L.LEFT_EYE_OUTER, L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
      const rightIris = getIrisRatio(landmarks, L.RIGHT_IRIS_CENTER, L.RIGHT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);

      const leftIrisXNormalized = 1 - leftIris.x;
      const avgIrisX = (leftIrisXNormalized + rightIris.x) / 2;
      const avgIrisY = (leftIris.y + rightIris.y) / 2;

      const headPose = estimateHeadPose(landmarks);

      return {
        irisX: avgIrisX,
        irisY: avgIrisY,
        headYaw: headPose.yaw,
        headPitch: headPose.pitch,
      };
    } catch {
      return null;
    }
  }, []);

  // Start sampling for the current calibration point
  const startSampling = useCallback((pointIndex) => {
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
          point: CALIBRATION_POINTS[pointIndex],
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

  // When calibration step changes, start sampling
  useEffect(() => {
    if (calibrationStep >= 0 && calibrationStep < CALIBRATION_POINTS.length) {
      startSampling(calibrationStep);
    }
    return () => {
      if (samplingRef.current) {
        clearInterval(samplingRef.current);
      }
    };
  }, [calibrationStep, startSampling]);

  // Build the screen bounds from calibration data and navigate to session
  const finishCalibration = useCallback(() => {
    const data = calibrationDataRef.current;

    const avgPoints = data.map(d => {
      const avgX = d.samples.reduce((s, g) => s + g.irisX, 0) / d.samples.length;
      const avgY = d.samples.reduce((s, g) => s + g.irisY, 0) / d.samples.length;
      const avgYaw = d.samples.reduce((s, g) => s + g.headYaw, 0) / d.samples.length;
      const avgPitch = d.samples.reduce((s, g) => s + g.headPitch, 0) / d.samples.length;
      return { irisX: avgX, irisY: avgY, headYaw: avgYaw, headPitch: avgPitch };
    });

    const allX = avgPoints.map(p => p.irisX);
    const allY = avgPoints.map(p => p.irisY);

    const rangeX = Math.max(...allX) - Math.min(...allX);
    const rangeY = Math.max(...allY) - Math.min(...allY);
    const marginX = Math.max(rangeX * 0.1, 0.02);
    const marginY = Math.max(rangeY * 0.1, 0.02);

    const screenBounds = {
      minX: Math.min(...allX) - marginX,
      maxX: Math.max(...allX) + marginX,
      minY: Math.min(...allY) - marginY,
      maxY: Math.max(...allY) + marginY,
      headYawRange: {
        min: Math.min(...avgPoints.map(p => p.headYaw)) - 5,
        max: Math.max(...avgPoints.map(p => p.headYaw)) + 5,
      },
      headPitchRange: {
        min: Math.min(...avgPoints.map(p => p.headPitch)) - 5,
        max: Math.max(...avgPoints.map(p => p.headPitch)) + 5,
      },
    };

    sessionStorage.setItem(`calibration_${sessionId}`, JSON.stringify(screenBounds));

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    if (faceLandmarkerRef.current) {
      faceLandmarkerRef.current.close();
      faceLandmarkerRef.current = null;
    }

    navigate(`/${role}/${sessionId}`);
  }, [sessionId, role, navigate, stream]);

  // ─── Render ────────────────────────────────────────────────────────

  const isCalibrating = calibrationStep >= 0;
  const currentPoint = isCalibrating ? CALIBRATION_POINTS[calibrationStep] : null;
  const progress = isCalibrating ? Math.round((samplesCollected / SAMPLES_PER_POINT) * 100) : 0;

  // Determine which UI content to show
  let content;

  if (cameraAllowed === null) {
    content = (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Camera Setup</h1>
          <p style={styles.text}>
            We need access to your camera to track visual engagement during the session.
            Your video is processed locally — it never leaves your browser.
          </p>
          <div style={styles.buttons}>
            <button style={{ ...styles.button, ...styles.allowBtn }} onClick={requestCamera}>
              Allow Camera Access
            </button>
            <button
              style={{ ...styles.button, ...styles.denyBtn }}
              onClick={() => setCameraAllowed(false)}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  } else if (cameraAllowed === false) {
    content = (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Camera Required</h1>
          <p style={styles.text}>
            Visual engagement tracking requires camera access to work.
            Without it, we can't measure screen attention during the session.
          </p>
          <p style={styles.textMuted}>
            Please enable camera access in your browser settings and try again.
          </p>
          <button
            style={{ ...styles.button, ...styles.allowBtn }}
            onClick={() => { setCameraAllowed(null); setError(null); }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  } else if (error) {
    content = (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Setup Error</h1>
          <p style={styles.text}>{error}</p>
        </div>
      </div>
    );
  } else if (!mediaPipeReady) {
    content = (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Loading Face Tracking...</h1>
          <p style={styles.textMuted}>This may take a few seconds on first load.</p>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  } else if (!isCalibrating) {
    content = (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Quick Calibration</h1>
          <p style={styles.text}>
            We'll show you 3 dots on screen. Look at each dot when it appears and hold
            your gaze for about a second. This helps us understand where your screen is
            so we can accurately track visual engagement.
          </p>
          <div style={styles.videoPreview}>
            <video autoPlay muted playsInline style={styles.previewVideo}
              ref={el => { if (el && stream) el.srcObject = stream; }}
            />
          </div>
          <button
            style={{ ...styles.button, ...styles.allowBtn, marginTop: '1rem', opacity: videoReady ? 1 : 0.5 }}
            onClick={() => setCalibrationStep(0)}
            disabled={!videoReady}
          >
            {videoReady ? 'Start Calibration' : 'Waiting for camera...'}
          </button>
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
            ...styles.dotInner,
            transform: `scale(${1 + (progress / 100) * 0.5})`,
          }} />
        </div>

        <div style={styles.calibrationInfo}>
          <p style={styles.calibrationText}>
            Look at the dot — {currentPoint.label}
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

  // Offscreen video is ALWAYS rendered so the ref is stable and MediaPipe can read frames
  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={styles.offscreenVideo}
      />
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
  buttons: {
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
  allowBtn: {
    background: '#238636',
    color: 'white',
  },
  denyBtn: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
  },
  videoPreview: {
    width: '100%',
    maxWidth: '320px',
    margin: '0 auto',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #30363d',
  },
  previewVideo: {
    width: '100%',
    display: 'block',
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
  calibrationFullscreen: {
    position: 'fixed',
    inset: 0,
    background: '#0d1117',
  },
  offscreenVideo: {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    width: '640px',
    height: '480px',
    pointerEvents: 'none',
  },
  dot: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#58a6ff',
    boxShadow: '0 0 20px rgba(88, 166, 255, 0.5)',
    transition: 'transform 0.15s ease',
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
