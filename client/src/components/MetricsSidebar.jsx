function MetricBar({ label, value, color }) {
  return (
    <div style={styles.metricRow}>
      <div style={styles.metricHeader}>
        <span style={styles.metricLabel}>{label}</span>
        <span style={{ ...styles.metricValue, color }}>{value}%</span>
      </div>
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function MutualAttentionIndicator({ active }) {
  return (
    <div style={styles.mutualAttention}>
      <div style={styles.metricHeader}>
        <span style={styles.metricLabel}>Mutual Attention</span>
        <span style={{
          ...styles.metricValue,
          color: active ? '#6ee7a0' : '#6b7280',
        }}>
          {active ? 'Active' : 'No'}
        </span>
      </div>
      <div style={{
        ...styles.mutualDot,
        background: active ? '#6ee7a0' : '#252a33',
        boxShadow: active ? '0 0 10px #6ee7a044' : 'none',
      }} />
    </div>
  );
}

function MetricsSidebar({ metrics }) {
  const {
    tutorEyeContact = 0, tutorTalkTime = 0, tutorEnergy = 0,
    studentEyeContact = 0, studentTalkTime = 0, studentEnergy = 0,
    mutualAttention = false,
  } = metrics || {};

  return (
    <div style={styles.sidebar}>
      <h3 style={styles.title}>Live Metrics</h3>

      <div style={styles.section}>
        <span style={styles.sectionLabel}>You (Tutor)</span>
        <MetricBar label="Eye Contact" value={tutorEyeContact} color="#e8985a" />
        <MetricBar label="Talk Time" value={tutorTalkTime} color="#e8985a" />
        <MetricBar label="Energy" value={tutorEnergy} color="#c4a5e0" />
      </div>

      <div style={styles.section}>
        <span style={styles.sectionLabel}>Student</span>
        <MetricBar label="Eye Contact" value={studentEyeContact} color="#6ee7a0" />
        <MetricBar label="Talk Time" value={studentTalkTime} color="#7ab8e0" />
        <MetricBar label="Energy" value={studentEnergy} color="#a78bde" />
      </div>

      <div style={styles.section}>
        <span style={styles.sectionLabel}>Session</span>
        <MutualAttentionIndicator active={mutualAttention} />
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: '280px',
    background: '#181c24',
    borderLeft: '1px solid #252a33',
    padding: '1.25rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  title: {
    fontSize: '0.95rem',
    fontWeight: 600,
    margin: 0,
    color: '#e0e4ea',
    letterSpacing: '0.01em',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  sectionLabel: {
    fontSize: '0.7rem',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
  },
  metricRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  metricHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: '0.82rem',
    color: '#9ca3af',
  },
  metricValue: {
    fontSize: '0.82rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  barTrack: {
    height: '5px',
    background: '#1e232d',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.6s ease',
    opacity: 0.85,
  },
  mutualAttention: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  mutualDot: {
    width: '100%',
    height: '5px',
    borderRadius: '3px',
    transition: 'background 0.6s ease, box-shadow 0.6s ease',
  },
};

export default MetricsSidebar;
