import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function ConsentScreen() {
  const [agreed, setAgreed] = useState(false);
  const navigate = useNavigate();

  const handleJoin = (role) => {
    if (!agreed) return;
    navigate(`/${role}`);
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
            onClick={() => handleJoin('tutor')}
            disabled={!agreed}
          >
            Join as Tutor
          </button>
          <button
            style={{ ...styles.button, ...styles.studentButton, opacity: agreed ? 1 : 0.5 }}
            onClick={() => handleJoin('student')}
            disabled={!agreed}
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
};

export default ConsentScreen;
