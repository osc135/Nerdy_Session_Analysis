function MetricBar({ label, value, color }) {
  const isNA = value === null || value === undefined;
  return (
    <div style={styles.metricRow}>
      <div style={styles.metricHeader}>
        <span style={styles.metricLabel}>{label}</span>
        <span style={{ ...styles.metricValue, color: isNA ? '#4b5563' : color }}>
          {isNA ? 'N/A' : `${value}%`}
        </span>
      </div>
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: isNA ? '0%' : `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function GazeIndicator({ label, value, activeColor }) {
  const isNA = value === null || value === undefined;
  // value is 0-100 gaze score; treat >= 50 as "looking"
  const looking = !isNA && value >= 50;
  return (
    <div style={styles.gazeRow}>
      <div style={{
        ...styles.gazeDot,
        background: isNA ? '#1e232d' : looking ? activeColor : '#252a33',
        boxShadow: looking ? `0 0 8px ${activeColor}66` : 'none',
      }} />
      <span style={styles.metricLabel}>{label}</span>
      <span style={{
        ...styles.gazeStatus,
        color: isNA ? '#4b5563' : looking ? activeColor : '#6b7280',
      }}>
        {isNA ? 'N/A' : looking ? 'Looking' : 'Away'}
      </span>
    </div>
  );
}

function MutualAttentionIndicator({ active }) {
  const isNA = active === null || active === undefined;
  return (
    <div style={styles.gazeRow}>
      <div style={{
        ...styles.gazeDot,
        background: isNA ? '#1e232d' : active ? '#6ee7a0' : '#252a33',
        boxShadow: !isNA && active ? '0 0 8px #6ee7a066' : 'none',
      }} />
      <span style={styles.metricLabel}>Mutual Attention</span>
      <span style={{
        ...styles.gazeStatus,
        color: isNA ? '#4b5563' : active ? '#6ee7a0' : '#6b7280',
      }}>
        {isNA ? 'N/A' : active ? 'Active' : 'No'}
      </span>
    </div>
  );
}

function MetricsSidebar({ metrics }) {
  const {
    tutorEyeContact = 0, tutorTalkTime = 0, tutorEnergy = 0,
    studentEyeContact, studentTalkTime, studentEnergy,
    mutualAttention, hasStudent = false,
  } = metrics || {};

  return (
    <div style={styles.sidebar}>
      <h3 style={styles.title}>Live Metrics</h3>

      <div style={styles.section}>
        <span style={styles.sectionLabel}>You (Tutor)</span>
        <GazeIndicator label="Eye Contact" value={tutorEyeContact} activeColor="#e8985a" />
        <MetricBar label="Talk Time" value={tutorTalkTime} color="#e8985a" />
        <MetricBar label="Energy" value={tutorEnergy} color="#c4a5e0" />
      </div>

      <div style={styles.section}>
        <span style={styles.sectionLabel}>
          Student{!hasStudent ? ' (not connected)' : ''}
        </span>
        <GazeIndicator label="Eye Contact" value={studentEyeContact} activeColor="#6ee7a0" />
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
  gazeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  gazeDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.4s ease, box-shadow 0.4s ease',
  },
  gazeStatus: {
    fontSize: '0.82rem',
    fontWeight: 600,
    marginLeft: 'auto',
  },
};

export default MetricsSidebar;
