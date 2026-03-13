// Structured server-side logger — toggle with DEBUG=true environment variable

const CATEGORIES = {
  WS:      '\x1b[32m',  // green
  API:     '\x1b[36m',  // cyan
  DB:      '\x1b[35m',  // magenta
  Session: '\x1b[33m',  // yellow
};
const RESET = '\x1b[0m';

function isEnabled() {
  return process.env.DEBUG === 'true';
}

function log(category, level, message, data) {
  if (!isEnabled()) return;

  const color = CATEGORIES[category] || '';
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const prefix = `${color}[${category}]${RESET}`;

  const fn = level === 'warn' ? console.warn : level === 'error' ? console.error : console.log;

  if (data !== undefined) {
    fn(`${prefix} ${timestamp} ${message}`, data);
  } else {
    fn(`${prefix} ${timestamp} ${message}`);
  }
}

export function createLogger(category) {
  return {
    info:  (msg, data) => log(category, 'info', msg, data),
    warn:  (msg, data) => log(category, 'warn', msg, data),
    error: (msg, data) => log(category, 'error', msg, data),
  };
}
