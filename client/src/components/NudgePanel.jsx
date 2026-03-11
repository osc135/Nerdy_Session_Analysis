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
        <span style={styles.toastDot} />
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
    background: '#1c2129',
    border: '1px solid #3d3520',
    borderRadius: '10px',
    padding: '0.85rem 1rem',
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  toastHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  toastDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#d4a04a',
    flexShrink: 0,
  },
  toastLabel: {
    fontSize: '0.7rem',
    color: '#d4a04a',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  dismissBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#6b7280',
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  toastMessage: {
    margin: 0,
    fontSize: '0.88rem',
    color: '#d1d5db',
    lineHeight: 1.5,
  },
  toastTime: {
    fontSize: '0.7rem',
    color: '#6b7280',
    marginTop: '0.4rem',
    display: 'block',
  },
};

export default NudgePanel;
