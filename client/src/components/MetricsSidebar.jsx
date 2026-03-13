import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribe, getLogBuffer, clearLogBuffer, isDebugOn, CATEGORIES } from '../utils/logger';

// Enable debug logging automatically when Logs tab is viewed
function enableDebug() {
  try { localStorage.setItem('debug', 'true'); } catch {}
}

function disableDebug() {
  try { localStorage.setItem('debug', 'false'); } catch {}
}

// --- Metric display components ---

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
  const looking = !isNA && value >= 50;
  return (
    <div style={styles.gazeRow}>
      <div style={{
        ...styles.gazeDot,
        background: isNA ? 'rgba(255,255,255,0.06)' : looking ? activeColor : 'rgba(255,255,255,0.08)',
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
        background: isNA ? 'rgba(255,255,255,0.06)' : active ? '#6ee7a0' : 'rgba(255,255,255,0.08)',
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

function AttentionDriftIndicator({ drift }) {
  const isNA = drift === null || drift === undefined;
  const drifting = !isNA && drift >= 65;
  return (
    <div style={styles.gazeRow}>
      <div style={{
        ...styles.gazeDot,
        background: isNA ? 'rgba(255,255,255,0.06)' : drifting ? '#d4a04a' : 'rgba(255,255,255,0.08)',
        boxShadow: drifting ? '0 0 8px #d4a04a66' : 'none',
      }} />
      <span style={styles.metricLabel}>Attention Drift</span>
      <span style={{
        ...styles.gazeStatus,
        color: isNA ? '#4b5563' : drifting ? '#d4a04a' : '#6b7280',
      }}>
        {isNA ? 'N/A' : drifting ? 'Drifting' : 'Focused'}
      </span>
    </div>
  );
}

// --- Log feed component ---

const LEVEL_COLORS = { info: '#cbd5e1', warn: '#fbbf24', error: '#f87171' };

function LogFeed() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState(null);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    enableDebug();
    setLogs([...getLogBuffer()]);

    const unsub = subscribe((entry) => {
      setLogs(prev => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });

    return () => {
      unsub();
      disableDebug();
    };
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  const filtered = filter ? logs.filter(l => l.category === filter) : logs;
  const categories = Object.keys(CATEGORIES);

  return (
    <div style={logStyles.wrapper}>
      {/* Filter chips */}
      <div style={logStyles.filters}>
        <button
          style={logStyles.chip(filter === null)}
          onClick={() => setFilter(null)}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            style={{
              ...logStyles.chip(filter === cat),
              color: filter === cat ? CATEGORIES[cat].color : '#64748b',
              borderColor: filter === cat ? CATEGORIES[cat].color + '55' : 'transparent',
            }}
            onClick={() => setFilter(prev => prev === cat ? null : cat)}
          >
            {cat}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          style={logStyles.clearBtn}
          onClick={() => { clearLogBuffer(); setLogs([]); }}
        >
          Clear
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={logStyles.entries}
      >
        {filtered.length === 0 && (
          <div style={logStyles.empty}>Waiting for logs...</div>
        )}
        {filtered.map((entry, i) => (
          <div
            key={i}
            style={{
              ...logStyles.entry,
              borderLeftColor: entry.color,
              background: entry.level === 'warn' ? '#fbbf2408' : entry.level === 'error' ? '#f8717108' : 'transparent',
            }}
          >
            <span style={logStyles.time}>{entry.timestamp}</span>
            {' '}
            <span style={{ color: entry.color, fontWeight: 600 }}>[{entry.category}]</span>
            {' '}
            <span style={{ color: LEVEL_COLORS[entry.level] }}>{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// --- Main sidebar ---

function MetricsSidebar({ metrics }) {
  const [tab, setTab] = useState('metrics');

  const {
    tutorEyeContact = 0, tutorTalkTime = 0, tutorEnergy = 0,
    studentEyeContact, studentTalkTime, studentEnergy,
    mutualAttention, attentionDrift, hasStudent = false,
  } = metrics || {};

  return (
    <div style={styles.sidebar}>
      {/* Tab header */}
      <div style={styles.tabBar}>
        <button
          style={styles.tab(tab === 'metrics')}
          onClick={() => setTab('metrics')}
        >
          Live Metrics
        </button>
        <button
          style={styles.tab(tab === 'logs')}
          onClick={() => setTab('logs')}
        >
          Logs
        </button>
      </div>

      {tab === 'metrics' ? (
        <>
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
            <AttentionDriftIndicator drift={attentionDrift} />
          </div>
        </>
      ) : (
        <LogFeed />
      )}
    </div>
  );
}

// --- Styles ---

const styles = {
  sidebar: {
    width: '280px',
    background: 'rgba(22,28,44,0.85)',
    borderLeft: '1px solid rgba(255,255,255,0.06)',
    padding: '1.25rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    backdropFilter: 'blur(20px)',
  },
  tabBar: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '0.25rem',
  },
  tab: (active) => ({
    flex: 1,
    padding: '8px 0',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #17E2EA' : '2px solid transparent',
    color: active ? '#e0e4ea' : '#6b7280',
    fontSize: '0.82rem',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  }),
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
    background: 'rgba(255,255,255,0.06)',
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

const logStyles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '8px',
    alignItems: 'center',
  },
  chip: (active) => ({
    padding: '2px 7px',
    borderRadius: '4px',
    border: active ? '1px solid #17E2EA55' : '1px solid transparent',
    background: active ? '#17E2EA15' : 'transparent',
    color: active ? '#17E2EA' : '#64748b',
    fontSize: '0.65rem',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  }),
  clearBtn: {
    padding: '2px 7px',
    borderRadius: '4px',
    border: 'none',
    background: 'none',
    color: '#4b5563',
    fontSize: '0.65rem',
    cursor: 'pointer',
  },
  entries: {
    flex: 1,
    overflowY: 'auto',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
    fontSize: '0.68rem',
    lineHeight: 1.6,
  },
  entry: {
    padding: '1px 8px',
    borderLeft: '2px solid',
    wordBreak: 'break-word',
  },
  time: {
    color: '#4b5563',
  },
  empty: {
    color: '#4b5563',
    textAlign: 'center',
    padding: '2rem 0',
    fontSize: '0.75rem',
  },
};

export default MetricsSidebar;
