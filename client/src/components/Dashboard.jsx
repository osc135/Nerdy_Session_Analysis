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

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '—';
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
        <div style={{
          ...styles.welcomeCard,
          borderTop: `2px solid ${user.role === 'tutor' ? '#17E2EA' : '#9E97FF'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{
              fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
              padding: '4px 12px', borderRadius: '60px', letterSpacing: '0.03em',
              background: user.role === 'tutor' ? 'rgba(23,226,234,0.12)' : 'rgba(158,151,255,0.12)',
              color: user.role === 'tutor' ? '#17E2EA' : '#9E97FF',
            }}>{user.role}</span>
          </div>
          <h2 style={styles.welcomeTitle}>Welcome, {user.name.split(' ')[0]}</h2>
          <p style={styles.welcomeText}>
            {user.role === 'tutor'
              ? 'Start a new tutoring session or review your past sessions below.'
              : 'Join your tutor\'s session or review your past sessions below.'}
          </p>
          <button
            style={{
              ...styles.startBtn,
              background: user.role === 'tutor' ? '#17E2EA' : '#9E97FF',
              color: '#0F0928',
              boxShadow: `0 4px 24px ${user.role === 'tutor' ? '#17E2EA40' : '#9E97FF40'}`,
            }}
            onClick={() => navigate('/session')}
          >
            {user.role === 'tutor' ? 'Start New Session' : 'Join a Session'}
          </button>
        </div>

        {/* Trend gauges — tutor only */}
        {trends && user.role === 'tutor' && (
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
                    <span style={styles.sessionDate}>{formatDate(s.startedAt)} {formatTime(s.startedAt)}</span>
                    <span style={styles.sessionDuration}>{formatDuration(s.durationMs)}</span>
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
    background: '#0F0928',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: '#161c2c',
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
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '60px',
    padding: '0.4rem 0.85rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },
  content: {
    flex: 1,
    padding: '2rem',
    maxWidth: '900px',
    margin: '0 auto',
    width: '100%',
  },
  welcomeCard: {
    background: 'rgba(22,28,44,0.7)',
    borderRadius: '20px',
    padding: '2rem',
    border: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '1.5rem',
    backdropFilter: 'blur(20px)',
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
    borderRadius: '60px',
    border: 'none',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  },
  trendsSection: {
    background: 'rgba(22,28,44,0.7)',
    borderRadius: '20px',
    padding: '1.5rem',
    border: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '1.5rem',
    backdropFilter: 'blur(20px)',
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
    borderTop: '1px solid rgba(255,255,255,0.06)',
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
    background: 'rgba(22,28,44,0.7)',
    borderRadius: '20px',
    padding: '1.25rem',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    backdropFilter: 'blur(20px)',
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
    background: 'rgba(22,28,44,0.7)',
    borderRadius: '20px',
    padding: '1.5rem',
    border: '1px solid rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
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
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
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
    padding: '2px 10px',
    borderRadius: '60px',
    background: role === 'tutor' ? 'rgba(23,226,234,0.12)' : 'rgba(158,151,255,0.12)',
    color: role === 'tutor' ? '#17E2EA' : '#9E97FF',
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
