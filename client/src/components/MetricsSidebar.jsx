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

function TalkTimeBalance({ tutorPercent, studentPercent }) {
  return (
    <div style={styles.balanceContainer}>
      <div style={styles.balanceLabels}>
        <span style={styles.balanceLabel}>Tutor {tutorPercent}%</span>
        <span style={styles.balanceLabel}>Student {studentPercent}%</span>
      </div>
      <div style={styles.balanceTrack}>
        <div style={{
          ...styles.balanceFill,
          width: `${tutorPercent}%`,
          background: '#f0883e',
          borderRadius: studentPercent === 0 ? '3px' : '3px 0 0 3px',
        }} />
        <div style={{
          ...styles.balanceFill,
          width: `${studentPercent}%`,
          background: '#58a6ff',
          borderRadius: tutorPercent === 0 ? '3px' : '0 3px 3px 0',
        }} />
      </div>
    </div>
  );
}

function MetricsSidebar({ metrics }) {
  const { eyeContact = 0, tutorTalkTime = 0, studentTalkTime = 0, energy = 0 } = metrics || {};

  return (
    <div style={styles.sidebar}>
      <h3 style={styles.title}>Live Metrics</h3>

      <div style={styles.section}>
        <span style={styles.sectionLabel}>Student Engagement</span>
        <MetricBar label="Eye Contact" value={eyeContact} color="#3fb950" />
        <MetricBar label="Energy" value={energy} color="#a371f7" />
      </div>

      <div style={styles.section}>
        <span style={styles.sectionLabel}>Talk Time Balance</span>
        <TalkTimeBalance tutorPercent={tutorTalkTime} studentPercent={studentTalkTime} />
      </div>

      <div style={styles.sessionInfo}>
        <span style={styles.sectionLabel}>Session</span>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Status</span>
          <span style={styles.infoValue}>Active</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: '280px',
    background: '#161b22',
    borderLeft: '1px solid #30363d',
    padding: '1.25rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 600,
    margin: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  sectionLabel: {
    fontSize: '0.75rem',
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
  },
  metricRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  metricHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: '0.85rem',
    color: '#c9d1d9',
  },
  metricValue: {
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  barTrack: {
    height: '6px',
    background: '#21262d',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.5s ease',
  },
  balanceContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  balanceLabels: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    fontSize: '0.8rem',
    color: '#8b949e',
  },
  balanceTrack: {
    display: 'flex',
    height: '8px',
    background: '#21262d',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  balanceFill: {
    height: '100%',
    transition: 'width 0.5s ease',
  },
  sessionInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
  },
  infoLabel: {
    color: '#8b949e',
  },
  infoValue: {
    color: '#c9d1d9',
  },
};

export default MetricsSidebar;
