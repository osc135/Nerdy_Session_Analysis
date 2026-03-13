import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribe, getLogBuffer, clearLogBuffer, toggleDebug, isDebugOn, CATEGORIES } from '../utils/logger';

const LEVEL_COLORS = {
  info: '#e2e8f0',
  warn: '#fbbf24',
  error: '#f87171',
};

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(isDebugOn);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState(null); // null = all categories
  const bottomRef = useRef(null);
  const autoScrollRef = useRef(true);
  const containerRef = useRef(null);

  // Subscribe to new log entries
  useEffect(() => {
    // Seed with existing buffer when opened
    if (open) setLogs([...getLogBuffer()]);

    const unsub = subscribe((entry) => {
      setLogs(prev => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });
    return unsub;
  }, [open]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Detect if user scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    autoScrollRef.current = atBottom;
  }, []);

  const handleToggle = () => {
    const next = toggleDebug();
    setEnabled(next);
    if (next) setOpen(true);
  };

  const handleClear = () => {
    clearLogBuffer();
    setLogs([]);
  };

  const filteredLogs = filter ? logs.filter(l => l.category === filter) : logs;

  // Floating toggle button (always visible)
  const buttonStyle = {
    position: 'fixed',
    bottom: 16,
    right: 16,
    zIndex: 99999,
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: `2px solid ${enabled ? '#22d3ee' : '#475569'}`,
    background: enabled ? '#0f172a' : '#1e293b',
    color: enabled ? '#22d3ee' : '#94a3b8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    boxShadow: enabled ? '0 0 12px rgba(34,211,238,0.3)' : '0 2px 8px rgba(0,0,0,0.3)',
    transition: 'all 0.2s',
  };

  // Panel overlay
  const panelStyle = {
    position: 'fixed',
    bottom: 70,
    right: 16,
    zIndex: 99998,
    width: Math.min(560, window.innerWidth - 32),
    maxHeight: '45vh',
    borderRadius: 10,
    background: '#0f172aee',
    border: '1px solid #334155',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
    fontSize: 11.5,
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderBottom: '1px solid #334155',
    flexShrink: 0,
  };

  const filterBtnStyle = (cat) => ({
    padding: '2px 8px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 10.5,
    fontWeight: filter === cat ? 700 : 400,
    background: filter === cat ? (CATEGORIES[cat]?.color || '#64748b') + '33' : 'transparent',
    color: filter === cat ? (CATEGORIES[cat]?.color || '#e2e8f0') : '#94a3b8',
    transition: 'all 0.15s',
  });

  return (
    <>
      {/* Floating button */}
      <button
        style={buttonStyle}
        onClick={() => {
          if (!enabled) {
            handleToggle();
          } else {
            setOpen(prev => !prev);
          }
        }}
        onDoubleClick={() => {
          if (enabled) {
            handleToggle(); // turn off
            setOpen(false);
          }
        }}
        title={enabled ? (open ? 'Hide debug panel' : 'Show debug panel') : 'Enable debug logging'}
      >
        {enabled ? '\u{1F41B}' : '\u{1F50D}'}
      </button>

      {/* Panel */}
      {open && enabled && (
        <div style={panelStyle}>
          {/* Header with filters */}
          <div style={headerStyle}>
            <span style={{ color: '#22d3ee', fontWeight: 700, marginRight: 4 }}>Debug</span>

            {/* Category filters */}
            <button
              style={filterBtnStyle(null)}
              onClick={() => setFilter(null)}
            >
              All
            </button>
            {Object.keys(CATEGORIES).map(cat => (
              <button
                key={cat}
                style={filterBtnStyle(cat)}
                onClick={() => setFilter(prev => prev === cat ? null : cat)}
              >
                {cat}
              </button>
            ))}

            <div style={{ flex: 1 }} />

            <span style={{ color: '#64748b', fontSize: 10 }}>{filteredLogs.length}</span>

            <button
              onClick={handleClear}
              style={{
                background: 'none', border: 'none', color: '#64748b',
                cursor: 'pointer', fontSize: 10, padding: '2px 6px',
              }}
              title="Clear logs"
            >
              Clear
            </button>

            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', color: '#64748b',
                cursor: 'pointer', fontSize: 14, padding: '0 4px', lineHeight: 1,
              }}
              title="Close panel"
            >
              \u00d7
            </button>
          </div>

          {/* Log entries */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {filteredLogs.length === 0 && (
              <div style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>
                Waiting for logs...
              </div>
            )}
            {filteredLogs.map((entry, i) => (
              <div
                key={i}
                style={{
                  padding: '2px 12px',
                  lineHeight: 1.5,
                  borderLeft: `3px solid ${entry.color}`,
                  background: entry.level === 'warn' ? '#fbbf2410' : entry.level === 'error' ? '#f8717110' : 'transparent',
                }}
              >
                <span style={{ color: '#64748b' }}>{entry.timestamp}</span>
                {' '}
                <span style={{ color: entry.color, fontWeight: 600 }}>
                  [{entry.category}]
                </span>
                {' '}
                <span style={{ color: LEVEL_COLORS[entry.level] || '#e2e8f0' }}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </>
  );
}
