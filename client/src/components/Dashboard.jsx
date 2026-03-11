import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import MetricGauge from './MetricGauge';

function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [trends, setTrends] = useState(null);
  const [trendCount, setTrendCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/sessions/history', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      fetch('/api/sessions/trends', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ])
      .then(([histData, trendData]) => {
        setSessions(Array.isArray(histData) ? histData : []);
        setTrends(trendData.trends || null);
        setTrendCount(trendData.sessionCount || 0);
      })
      .catch(() => {
        setSessions([]);
        setTrends(null);
      })
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

        {/* Trend gauges */}
        {trends && (
          <div style={styles.trendsSection}>
            <div style={styles.trendsHeader}>
              <h3 style={styles.sectionTitle}>Your Trends</h3>
              <span style={styles.trendsSub}>Averaged across {trendCount} session{trendCount !== 1 ? 's' : ''}</span>
            </div>
            <div style={styles.gaugeRow}>
              <MetricGauge label="Your Eye Contact" value={trends.eyeContact} />
              <MetricGauge label="Student Eye Contact" value={trends.studentEyeContact} />
              <MetricGauge label="Your Talk Time" value={trends.talkTime} />
              <MetricGauge label="Your Energy" value={trends.energy} />
              <MetricGauge label="Student Energy" value={trends.studentEnergy} />
            </div>
            <div style={styles.interruptionRow}>
              <span style={styles.interruptionLabel}>Avg Interruptions</span>
              <span style={{
                ...styles.interruptionValue,
                color: trends.interruptionsPerMin > 1 ? '#e06060' : trends.interruptionsPerMin > 0.5 ? '#e8b45a' : '#6ee7a0',
              }}>
                {trends.interruptionsPerMin}/min
              </span>
            </div>
          </div>
        )}

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
                  style={{
                    ...styles.sessionRow,
                    cursor: s.role === 'tutor' ? 'pointer' : 'default',
                  }}
                  onClick={() => s.role === 'tutor' && navigate(`/report/${s.sessionCode}`)}
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
                      color: s.merged ? '#6ee7a0' : '#6b7280',
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
    borderBottom: '1px solid #252a33',
    background: '#181c24',
  },
  title: {
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: 0,
    color: '#e0e4ea',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  name: {
    fontSize: '0.88rem',
    color: '#9ca3af',
  },
  logoutBtn: {
    background: '#1e232d',
    color: '#9ca3af',
    border: '1px solid #252a33',
    borderRadius: '6px',
    padding: '0.4rem 0.75rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  content: {
    flex: 1,
    padding: '2rem',
    maxWidth: '900px',
    margin: '0 auto',
    width: '100%',
  },
  welcomeCard: {
    background: '#181c24',
    borderRadius: '14px',
    padding: '2rem',
    border: '1px solid #252a33',
    marginBottom: '1.5rem',
  },
  welcomeTitle: {
    fontSize: '1.3rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
    color: '#e0e4ea',
  },
  welcomeText: {
    color: '#6b7280',
    marginBottom: '1.5rem',
    fontSize: '0.92rem',
  },
  startBtn: {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    background: '#2d7a4a',
    color: 'white',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  trendsSection: {
    background: '#181c24',
    borderRadius: '14px',
    padding: '1.5rem',
    border: '1px solid #252a33',
    marginBottom: '1.5rem',
  },
  trendsHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  trendsSub: {
    fontSize: '0.78rem',
    color: '#6b7280',
  },
  gaugeRow: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  interruptionRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '1rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #252a33',
  },
  interruptionLabel: {
    fontSize: '0.78rem',
    color: '#9ca3af',
  },
  interruptionValue: {
    fontSize: '0.95rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  statsRow: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  statCard: {
    flex: 1,
    background: '#181c24',
    borderRadius: '14px',
    padding: '1.25rem',
    border: '1px solid #252a33',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },
  statValue: {
    fontSize: '1.7rem',
    fontWeight: 700,
    color: '#e0e4ea',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontSize: '0.78rem',
    color: '#6b7280',
  },
  section: {
    background: '#181c24',
    borderRadius: '14px',
    padding: '1.5rem',
    border: '1px solid #252a33',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: '1rem',
    color: '#e0e4ea',
  },
  placeholder: {
    color: '#6b7280',
    fontSize: '0.88rem',
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
    background: '#13161b',
    borderRadius: '8px',
    border: '1px solid #252a33',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  sessionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  sessionCode: {
    fontFamily: 'monospace',
    fontSize: '0.88rem',
    color: '#7ab8e0',
  },
  roleBadge: (role) => ({
    fontSize: '0.68rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: '10px',
    background: role === 'tutor' ? '#2d7a4a22' : '#2b5ea622',
    color: role === 'tutor' ? '#6ee7a0' : '#7ab8e0',
    letterSpacing: '0.03em',
  }),
  sessionMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  sessionDate: {
    fontSize: '0.82rem',
    color: '#6b7280',
  },
  sessionDuration: {
    fontSize: '0.82rem',
    color: '#9ca3af',
    fontWeight: 500,
  },
  mergedBadge: {
    fontSize: '0.72rem',
    fontWeight: 600,
  },
};

export default Dashboard;
