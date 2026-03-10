import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Preload MediaPipe assets while user reads consent screen
function usePreloadMediaPipe() {
  useEffect(() => {
    const urls = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_bundle.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_bundle_mjs.js',
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    ];
    urls.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    });
  }, []);
}

function ConsentScreen() {
  usePreloadMediaPipe();
  const [agreed, setAgreed] = useState(false);
  const [sessionCode, setSessionCode] = useState('');
  const navigate = useNavigate();

  const handleTutorJoin = () => {
    if (!agreed) return;
    const sessionId = crypto.randomUUID().slice(0, 8);
    navigate(`/tutor/${sessionId}`);
  };

  const handleStudentJoin = () => {
    if (!agreed || !sessionCode.trim()) return;
    navigate(`/student/${sessionCode.trim()}`);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Live Session Analysis</h1>
        <p style={styles.subtitle}>AI-Powered Engagement Coaching for Tutoring Sessions</p>

        <div style={styles.consentBox}>
          <h2 style={styles.sectionTitle}>Before We Begin</h2>
          <p>This system analyzes your video session in real time to provide engagement feedback. Here's what you should know:</p>

          <ul style={styles.list}>
            <li><strong>What we analyze:</strong> Facial landmarks for eye contact and energy, voice activity for speaking time — all processed locally in your browser.</li>
            <li><strong>What we share:</strong> Only metric scores (numbers like "eye contact: 72%") are shared between participants. No raw video or audio ever leaves your browser.</li>
            <li><strong>What we store:</strong> Session metric summaries are saved on the server for post-session reports and trend analysis. No video or audio is recorded.</li>
            <li><strong>Who sees what:</strong> Tutors see full analytics and coaching nudges. Students see their own personal engagement summary.</li>
            <li><strong>Your control:</strong> You can end the session at any time. Analysis stops immediately when you leave.</li>
          </ul>
        </div>

        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>I understand and consent to real-time engagement analysis during this session.</span>
        </label>

        <div style={styles.buttons}>
          <button
            style={{ ...styles.button, ...styles.tutorButton, opacity: agreed ? 1 : 0.5 }}
            onClick={handleTutorJoin}
            disabled={!agreed}
          >
            Join as Tutor
          </button>
        </div>

        <div style={styles.divider}>
          <span style={styles.dividerText}>or join an existing session</span>
        </div>

        <div style={styles.studentJoin}>
          <input
            type="text"
            placeholder="Enter session code"
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStudentJoin()}
            style={styles.codeInput}
          />
          <button
            style={{ ...styles.button, ...styles.studentButton, opacity: agreed && sessionCode.trim() ? 1 : 0.5 }}
            onClick={handleStudentJoin}
            disabled={!agreed || !sessionCode.trim()}
          >
            Join as Student
          </button>
        </div>
      </div>
    </div>
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
    maxWidth: '640px',
    width: '100%',
    border: '1px solid #30363d',
  },
  title: {
    fontSize: '1.8rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
  },
  subtitle: {
    color: '#8b949e',
    marginBottom: '2rem',
  },
  consentBox: {
    background: '#0d1117',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    border: '1px solid #30363d',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    marginBottom: '0.75rem',
  },
  list: {
    paddingLeft: '1.25rem',
    lineHeight: '1.8',
    fontSize: '0.9rem',
    color: '#c9d1d9',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  buttons: {
    display: 'flex',
    gap: '1rem',
  },
  button: {
    flex: 1,
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  tutorButton: {
    background: '#238636',
    color: 'white',
  },
  studentButton: {
    background: '#1f6feb',
    color: 'white',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '1.5rem 0',
    gap: '1rem',
  },
  dividerText: {
    color: '#8b949e',
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
    width: '100%',
    textAlign: 'center',
  },
  studentJoin: {
    display: 'flex',
    gap: '1rem',
  },
  codeInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #30363d',
    background: '#0d1117',
    color: '#c9d1d9',
    fontSize: '1rem',
    outline: 'none',
  },
};

export default ConsentScreen;
