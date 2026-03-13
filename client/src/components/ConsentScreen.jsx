import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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

const SENSITIVITY_LEVELS = [
  { value: 'low', label: 'Low', desc: 'Fewer nudges — only flags major issues' },
  { value: 'medium', label: 'Medium', desc: 'Balanced — catches most engagement issues' },
  { value: 'high', label: 'High', desc: 'More proactive — flags early signs of disengagement' },
];

function ConsentScreen() {
  usePreloadMediaPipe();
  const { user } = useAuth();
  const isTutor = user?.role === 'tutor';

  const [agreed, setAgreed] = useState(false);
  const [sessionCode, setSessionCode] = useState('');
  const [sessionType, setSessionType] = useState('lecture');
  const [sensitivity, setSensitivity] = useState('medium');
  const navigate = useNavigate();

  const handleTutorStart = () => {
    if (!agreed) return;
    const sessionId = crypto.randomUUID().slice(0, 8);
    navigate(`/tutor/${sessionId}?type=${sessionType}&sensitivity=${sensitivity}`);
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
            {isTutor
              ? <li><strong>Who sees what:</strong> You'll see full analytics and coaching nudges. Your student sees their own personal engagement summary only.</li>
              : <li><strong>Who sees what:</strong> You'll see your personal engagement summary. Your tutor sees full analytics and coaching nudges.</li>
            }
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

        {isTutor ? (
          <>
            <div style={styles.sessionTypeBox}>
              <h3 style={styles.sessionTypeTitle}>Session Type</h3>
              <div style={styles.typeOptions}>
                {SESSION_TYPES.map(t => (
                  <label
                    key={t.value}
                    style={{
                      ...styles.typeOption,
                      borderColor: sessionType === t.value ? '#17E2EA44' : 'rgba(255,255,255,0.06)',
                      background: sessionType === t.value ? 'rgba(23,226,234,0.06)' : 'transparent',
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

            <div style={styles.sessionTypeBox}>
              <h3 style={styles.sessionTypeTitle}>Coaching Sensitivity</h3>
              <div style={styles.sensitivityOptions}>
                {SENSITIVITY_LEVELS.map(s => (
                  <label
                    key={s.value}
                    style={{
                      ...styles.sensitivityOption,
                      borderColor: sensitivity === s.value ? '#17E2EA44' : 'rgba(255,255,255,0.06)',
                      background: sensitivity === s.value ? 'rgba(23,226,234,0.06)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="sensitivity"
                      value={s.value}
                      checked={sensitivity === s.value}
                      onChange={() => setSensitivity(s.value)}
                      style={{ display: 'none' }}
                    />
                    <span style={styles.typeLabel}>{s.label}</span>
                    <span style={styles.typeDesc}>{s.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              style={{ ...styles.button, ...styles.tutorButton, opacity: agreed ? 1 : 0.4 }}
              onClick={handleTutorStart}
              disabled={!agreed}
            >
              Start Session
            </button>
          </>
        ) : (
          <div style={styles.studentSection}>
            <h3 style={styles.sessionTypeTitle}>Join a Session</h3>
            <p style={styles.studentHint}>Enter the session code your tutor gave you.</p>
            <div style={styles.studentJoin}>
              <input
                type="text"
                placeholder="Session code"
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
                Join Session
              </button>
            </div>
          </div>
        )}
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
    position: 'relative',
  },
  card: {
    background: 'rgba(22,28,44,0.8)',
    borderRadius: '20px',
    padding: '2.5rem',
    maxWidth: '640px',
    width: '100%',
    border: '1px solid rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    position: 'relative',
    zIndex: 1,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    color: '#ffffff',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    marginBottom: '2rem',
    fontSize: '0.88rem',
  },
  consentBox: {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '16px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    fontSize: '1.05rem',
    marginBottom: '0.75rem',
    color: '#ffffff',
  },
  introParagraph: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
  },
  list: {
    paddingLeft: '1.25rem',
    lineHeight: '1.8',
    fontSize: '0.88rem',
    color: 'rgba(255,255,255,0.5)',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    cursor: 'pointer',
    fontSize: '0.88rem',
    color: 'rgba(255,255,255,0.5)',
  },
  sessionTypeBox: {
    marginBottom: '1.5rem',
  },
  sessionTypeTitle: {
    fontSize: '0.95rem',
    marginBottom: '0.75rem',
    color: '#ffffff',
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
  sensitivityOptions: {
    display: 'flex',
    gap: '0.5rem',
  },
  sensitivityOption: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    textAlign: 'center',
  },
  button: {
    padding: '0.8rem 1.5rem',
    borderRadius: '60px',
    border: 'none',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s, transform 0.15s, box-shadow 0.2s',
    width: '100%',
    fontFamily: 'inherit',
  },
  tutorButton: {
    background: '#17E2EA',
    boxShadow: '0 4px 24px #17E2EA40',
    color: '#0F0928',
  },
  studentButton: {
    background: '#9E97FF',
    boxShadow: '0 4px 24px #9E97FF40',
    color: '#0F0928',
    width: 'auto',
  },
  studentSection: {
    marginTop: '0.5rem',
  },
  studentHint: {
    color: '#6b7280',
    fontSize: '0.85rem',
    marginBottom: '1rem',
  },
  studentJoin: {
    display: 'flex',
    gap: '1rem',
  },
  codeInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  },
};

export default ConsentScreen;
