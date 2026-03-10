import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sessions/history', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [token]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const getDuration = (start, end) => {
    if (!start || !end) return '—';
    const ms = new Date(end) - new Date(start);
    const mins = Math.round(ms / 60000);
    if (mins < 1) return '< 1 min';
    return `${mins} min`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <h1 style={styles.title}>Dashboard</h1>
        <div style={styles.userInfo}>
          <span style={styles.name}>{user.name}</span>
          <button style={styles.logoutBtn} onClick={logout}>Log out</button>
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.welcomeCard}>
          <h2 style={styles.welcomeTitle}>Welcome, {user.name.split(' ')[0]}</h2>
          <p style={styles.welcomeText}>Start a new tutoring session or review your past sessions below.</p>
          <button style={styles.startBtn} onClick={() => navigate('/session')}>
            Start New Session
          </button>
        </div>

        {/* Stats summary */}
        {sessions.length > 0 && (
          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{sessions.length}</span>
              <span style={styles.statLabel}>Total Sessions</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>
                {sessions.filter(s => s.role === 'tutor').length}
              </span>
              <span style={styles.statLabel}>As Tutor</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>
                {sessions.filter(s => s.role === 'student').length}
              </span>
              <span style={styles.statLabel}>As Student</span>
            </div>
          </div>
        )}

        {/* Sessions list */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Recent Sessions</h3>
          {loading ? (
            <p style={styles.placeholder}>Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p style={styles.placeholder}>No sessions yet. Start your first session above!</p>
          ) : (
            <div style={styles.sessionList}>
              {sessions.map((s) => (
                <div
                  key={s.sessionCode}
                  style={styles.sessionRow}
                  onClick={() => navigate(`/report/${s.sessionCode}`)}
                >
                  <div style={styles.sessionInfo}>
                    <span style={styles.sessionCode}>{s.sessionCode}</span>
                    <span style={styles.roleBadge(s.role)}>{s.role}</span>
                  </div>
                  <div style={styles.sessionMeta}>
                    <span style={styles.sessionDate}>{formatDate(s.createdAt)} {formatTime(s.createdAt)}</span>
                    <span style={styles.sessionDuration}>{getDuration(s.createdAt, s.endedAt)}</span>
                    <span style={{
                      ...styles.mergedBadge,
                      color: s.merged ? '#3fb950' : '#8b949e',
                    }}>
                      {s.merged ? 'Complete' : 'Partial'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    borderBottom: '1px solid #30363d',
    background: '#161b22',
  },
  title: {
    fontSize: '1.2rem',
    fontWeight: 600,
    margin: 0,
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  name: {
    fontSize: '0.9rem',
    color: '#c9d1d9',
  },
  logoutBtn: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '0.4rem 0.75rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    padding: '2rem',
    maxWidth: '900px',
    margin: '0 auto',
    width: '100%',
  },
  welcomeCard: {
    background: '#161b22',
    borderRadius: '12px',
    padding: '2rem',
    border: '1px solid #30363d',
    marginBottom: '1.5rem',
  },
  welcomeTitle: {
    fontSize: '1.4rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  },
  welcomeText: {
    color: '#8b949e',
    marginBottom: '1.5rem',
    fontSize: '0.95rem',
  },
  startBtn: {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    background: '#238636',
    color: 'white',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  statsRow: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  statCard: {
    flex: 1,
    background: '#161b22',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '1px solid #30363d',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },
  statValue: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#e6edf3',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#8b949e',
  },
  section: {
    background: '#161b22',
    borderRadius: '12px',
    padding: '1.5rem',
    border: '1px solid #30363d',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    marginBottom: '1rem',
  },
  placeholder: {
    color: '#8b949e',
    fontSize: '0.9rem',
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sessionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    background: '#0d1117',
    borderRadius: '8px',
    border: '1px solid #30363d',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  sessionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  sessionCode: {
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    color: '#58a6ff',
  },
  roleBadge: (role) => ({
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: '10px',
    background: role === 'tutor' ? '#238636' + '33' : '#1f6feb' + '33',
    color: role === 'tutor' ? '#3fb950' : '#58a6ff',
  }),
  sessionMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  sessionDate: {
    fontSize: '0.85rem',
    color: '#8b949e',
  },
  sessionDuration: {
    fontSize: '0.85rem',
    color: '#c9d1d9',
    fontWeight: 500,
  },
  mergedBadge: {
    fontSize: '0.75rem',
    fontWeight: 600,
  },
};

export default Dashboard;
