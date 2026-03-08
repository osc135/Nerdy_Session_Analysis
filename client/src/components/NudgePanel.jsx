function NudgePanel({ nudges = [] }) {
  return (
    <div style={styles.panel}>
      <h3 style={styles.title}>Coaching Nudges</h3>
      {nudges.length === 0 ? (
        <p style={styles.empty}>No nudges yet. Coaching suggestions will appear here during the session.</p>
      ) : (
        nudges.map((nudge, i) => (
          <div key={i} style={styles.nudge}>
            {nudge.message}
          </div>
        ))
      )}
    </div>
  );
}

const styles = {
  panel: {
    marginTop: '1rem',
    padding: '1rem',
    background: '#0d1117',
    borderRadius: '8px',
    border: '1px solid #30363d',
  },
  title: {
    fontSize: '0.95rem',
    marginBottom: '0.75rem',
  },
  empty: {
    color: '#8b949e',
    fontSize: '0.8rem',
  },
  nudge: {
    padding: '0.5rem',
    marginBottom: '0.5rem',
    background: '#1c2128',
    borderRadius: '4px',
    fontSize: '0.85rem',
    borderLeft: '3px solid #d29922',
  },
};

export default NudgePanel;
