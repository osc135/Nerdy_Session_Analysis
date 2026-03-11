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

const SESSION_TYPES = [
  { value: 'lecture', label: 'Lecture / Explanation', desc: 'Tutor presents, student listens — 70-80% tutor talk expected' },
  { value: 'practice', label: 'Practice / Review', desc: 'Student works through problems — 30-50% tutor talk expected' },
  { value: 'socratic', label: 'Socratic Discussion', desc: 'Back-and-forth dialogue — 40-60% tutor talk expected' },
];

function ConsentScreen() {
  usePreloadMediaPipe();
  const [agreed, setAgreed] = useState(false);
  const [sessionCode, setSessionCode] = useState('');
  const [sessionType, setSessionType] = useState('lecture');
  const navigate = useNavigate();

  const handleTutorJoin = () => {
    if (!agreed) return;
    const sessionId = crypto.randomUUID().slice(0, 8);
    navigate(`/tutor/${sessionId}?type=${sessionType}`);
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
          <p style={styles.introParagraph}>This system analyzes your video session in real time to provide engagement feedback. Here's what you should know:</p>

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

        <div style={styles.sessionTypeBox}>
          <h3 style={styles.sessionTypeTitle}>Session Type</h3>
          <div style={styles.typeOptions}>
            {SESSION_TYPES.map(t => (
              <label
                key={t.value}
                style={{
                  ...styles.typeOption,
                  borderColor: sessionType === t.value ? '#2d7a4a' : '#252a33',
                  background: sessionType === t.value ? '#2d7a4a18' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="sessionType"
                  value={t.value}
                  checked={sessionType === t.value}
                  onChange={() => setSessionType(t.value)}
                  style={{ display: 'none' }}
                />
                <span style={styles.typeLabel}>{t.label}</span>
                <span style={styles.typeDesc}>{t.desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={styles.buttons}>
          <button
            style={{ ...styles.button, ...styles.tutorButton, opacity: agreed ? 1 : 0.4 }}
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
            style={{ ...styles.button, ...styles.studentButton, opacity: agreed && sessionCode.trim() ? 1 : 0.4 }}
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
    background: '#181c24',
    borderRadius: '14px',
    padding: '3rem',
    maxWidth: '640px',
    width: '100%',
    border: '1px solid #252a33',
  },
  title: {
    fontSize: '1.6rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    color: '#e0e4ea',
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: '2rem',
    fontSize: '0.88rem',
  },
  consentBox: {
    background: '#13161b',
    borderRadius: '10px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    border: '1px solid #252a33',
  },
  sectionTitle: {
    fontSize: '1.05rem',
    marginBottom: '0.75rem',
    color: '#e0e4ea',
  },
  introParagraph: {
    color: '#9ca3af',
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
  },
  list: {
    paddingLeft: '1.25rem',
    lineHeight: '1.8',
    fontSize: '0.88rem',
    color: '#9ca3af',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    cursor: 'pointer',
    fontSize: '0.88rem',
    color: '#9ca3af',
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
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  tutorButton: {
    background: '#2d7a4a',
    color: 'white',
  },
  studentButton: {
    background: '#2b5ea6',
    color: 'white',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '1.5rem 0',
    gap: '1rem',
  },
  dividerText: {
    color: '#6b7280',
    fontSize: '0.82rem',
    whiteSpace: 'nowrap',
    width: '100%',
    textAlign: 'center',
  },
  studentJoin: {
    display: 'flex',
    gap: '1rem',
  },
  sessionTypeBox: {
    marginBottom: '1.5rem',
  },
  sessionTypeTitle: {
    fontSize: '0.95rem',
    marginBottom: '0.75rem',
    color: '#e0e4ea',
    fontWeight: 600,
  },
  typeOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  typeOption: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  typeLabel: {
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#e0e4ea',
  },
  typeDesc: {
    fontSize: '0.78rem',
    color: '#6b7280',
  },
  codeInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #252a33',
    background: '#13161b',
    color: '#d1d5db',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
};

export default ConsentScreen;
