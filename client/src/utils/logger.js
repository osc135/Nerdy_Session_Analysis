// Structured debug logger with in-app overlay support.
// Toggle with Ctrl+Shift+D, the floating debug button, or
// localStorage.setItem('debug', 'true') in the console.

const CATEGORIES = {
  MediaPipe: { color: '#22d3ee', icon: '\u{1F441}' },
  Audio:     { color: '#a78bfa', icon: '\u{1F399}' },
  WebRTC:    { color: '#34d399', icon: '\u{1F517}' },
  Nudge:     { color: '#fb923c', icon: '\u{1F4A1}' },
  Metrics:   { color: '#60a5fa', icon: '\u{1F4CA}' },
  Session:   { color: '#f472b6', icon: '\u{1F4CB}' },
};

// --- In-memory log buffer + subscribers for the overlay panel ---
const MAX_BUFFER = 500;
const logBuffer = [];
const subscribers = new Set();

function pushEntry(entry) {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER) logBuffer.shift();
  for (const fn of subscribers) fn(entry);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getLogBuffer() {
  return logBuffer;
}

export function clearLogBuffer() {
  logBuffer.length = 0;
}

export { CATEGORIES };

// --- Core ---

function isEnabled() {
  try {
    return localStorage.getItem('debug') === 'true';
  } catch {
    return false;
  }
}

export function isDebugOn() {
  return isEnabled();
}

function formatStyle(color) {
  return `color: ${color}; font-weight: bold;`;
}

function log(category, level, message, data) {
  if (!isEnabled()) return;

  const cat = CATEGORIES[category] || { color: '#9ca3af', icon: '\u2022' };
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 });

  // Push to in-memory buffer for overlay
  pushEntry({ category, level, message, timestamp, color: cat.color, icon: cat.icon });

  // Console output
  const prefix = `${cat.icon} [${category}]`;
  const style = formatStyle(cat.color);
  const fn = level === 'warn' ? console.warn : level === 'error' ? console.error : console.log;

  if (data !== undefined) {
    fn(`%c${prefix}%c ${timestamp} ${message}`, style, 'color: inherit', data);
  } else {
    fn(`%c${prefix}%c ${timestamp} ${message}`, style, 'color: inherit');
  }
}

export function createLogger(category) {
  return {
    info:  (msg, data) => log(category, 'info', msg, data),
    warn:  (msg, data) => log(category, 'warn', msg, data),
    error: (msg, data) => log(category, 'error', msg, data),
  };
}

// Toggle debug mode
export function toggleDebug() {
  const next = !isEnabled();
  localStorage.setItem('debug', String(next));
  console.log(`%c[Debug] ${next ? 'ON' : 'OFF'}`, 'color: #facc15; font-weight: bold; font-size: 14px');
  return next;
}

// Expose globally so graders can type toggleDebug() in the console
if (typeof window !== 'undefined') {
  window.toggleDebug = toggleDebug;
}
