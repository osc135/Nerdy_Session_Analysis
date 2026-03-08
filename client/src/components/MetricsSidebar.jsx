function MetricsSidebar({ tutorMetrics, studentMetrics }) {
  return (
    <div style={styles.sidebar}>
      <h2 style={styles.title}>Live Metrics</h2>
      <p style={styles.placeholder}>Recharts gauges + timeline coming in Day 2.</p>
    </div>
  );
}

const styles = {
  sidebar: {
    width: '320px',
    background: '#161b22',
    borderLeft: '1px solid #30363d',
    padding: '1rem',
    overflowY: 'auto',
  },
  title: {
    fontSize: '1.1rem',
    marginBottom: '1rem',
  },
  placeholder: {
    color: '#8b949e',
    fontSize: '0.85rem',
  },
};

export default MetricsSidebar;
