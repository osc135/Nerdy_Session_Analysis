import { useState, useEffect } from 'react';

function NudgeToast({ nudge, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slide in
    requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss after 8 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={{
      ...styles.toast,
      transform: visible ? 'translateX(0)' : 'translateX(120%)',
      opacity: visible ? 1 : 0,
    }}>
      <div style={styles.toastHeader}>
        <span style={styles.toastIcon}>&#9679;</span>
        <span style={styles.toastLabel}>Coaching Suggestion</span>
        <button style={styles.dismissBtn} onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 300);
        }}>&times;</button>
      </div>
      <p style={styles.toastMessage}>{nudge.message}</p>
      {nudge.timestamp && (
        <span style={styles.toastTime}>{nudge.timestamp}</span>
      )}
    </div>
  );
}

function NudgePanel({ nudges = [] }) {
  const [dismissed, setDismissed] = useState(new Set());

  const activeNudges = nudges.filter((_, i) => !dismissed.has(i));

  const handleDismiss = (index) => {
    setDismissed((prev) => new Set(prev).add(index));
  };

  return (
    <div style={styles.container}>
      {activeNudges.length === 0 ? null : (
        nudges.map((nudge, i) => (
          !dismissed.has(i) && (
            <NudgeToast
              key={i}
              nudge={nudge}
              onDismiss={() => handleDismiss(i)}
            />
          )
        ))
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    zIndex: 1000,
    maxWidth: '340px',
  },
  toast: {
    background: '#1c2128',
    border: '1px solid #d29922',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
  toastHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginBottom: '0.4rem',
  },
  toastIcon: {
    color: '#d29922',
    fontSize: '0.6rem',
  },
  toastLabel: {
    fontSize: '0.75rem',
    color: '#d29922',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  dismissBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#8b949e',
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  toastMessage: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#e6edf3',
    lineHeight: 1.4,
  },
  toastTime: {
    fontSize: '0.7rem',
    color: '#8b949e',
    marginTop: '0.3rem',
    display: 'block',
  },
};

export default NudgePanel;
