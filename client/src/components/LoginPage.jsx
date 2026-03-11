import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [role, setRole] = useState(null); // null = choosing, 'tutor' or 'student'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const body = mode === 'signup'
      ? { email, password, name, role }
      : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      login(data.token, data.user);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
  };

  // Role selection screen
  if (!role) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Live Session Analysis</h1>
          <p style={styles.subtitle}>AI-Powered Engagement Coaching for Tutoring Sessions</p>

          <p style={styles.rolePrompt}>I am a...</p>
          <div style={styles.roleButtons}>
            <button style={styles.roleCard} onClick={() => setRole('tutor')}>
              <span style={styles.roleIcon}>T</span>
              <span style={styles.roleLabel}>Tutor</span>
              <span style={styles.roleDesc}>Create sessions, receive coaching nudges, and view full analytics</span>
            </button>
            <button style={styles.roleCard} onClick={() => setRole('student')}>
              <span style={{ ...styles.roleIcon, background: '#2b5ea633', color: '#7ab8e0' }}>S</span>
              <span style={styles.roleLabel}>Student</span>
              <span style={styles.roleDesc}>Join sessions and view your personal engagement summary</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isTutor = role === 'tutor';
  const accentColor = isTutor ? '#2d7a4a' : '#2b5ea6';
  const accentLight = isTutor ? '#6ee7a0' : '#7ab8e0';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <button style={styles.backBtn} onClick={() => { setRole(null); setError(''); setMode('login'); }}>
          Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span style={{
            ...styles.roleIcon,
            width: '32px', height: '32px', fontSize: '0.85rem',
            background: isTutor ? '#2d7a4a33' : '#2b5ea633',
            color: accentLight,
          }}>
            {isTutor ? 'T' : 'S'}
          </span>
          <h1 style={styles.title}>
            {mode === 'signup' ? 'Create' : 'Sign into'} {isTutor ? 'Tutor' : 'Student'} Account
          </h1>
        </div>
        <p style={styles.subtitle}>
          {isTutor
            ? 'Run sessions, get real-time coaching, and track your improvement over time.'
            : 'Join your tutor\'s session and see your personal engagement metrics.'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
            minLength={6}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={{ ...styles.submitBtn, background: accentColor }}>
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p style={styles.toggle}>
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <button style={{ ...styles.toggleBtn, color: accentLight }} onClick={() => { setMode('signup'); setError(''); }}>
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button style={{ ...styles.toggleBtn, color: accentLight }} onClick={() => { setMode('login'); setError(''); }}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
  },
  card: {
    background: '#181c24',
    borderRadius: '14px',
    padding: '3rem',
    maxWidth: '480px',
    width: '100%',
    border: '1px solid #252a33',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 700,
    margin: 0,
    color: '#e0e4ea',
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: '2rem',
    fontSize: '0.88rem',
  },
  rolePrompt: {
    color: '#9ca3af',
    fontSize: '0.95rem',
    marginBottom: '1rem',
    textAlign: 'center',
  },
  roleButtons: {
    display: 'flex',
    gap: '1rem',
  },
  roleCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1.5rem 1rem',
    borderRadius: '12px',
    border: '1px solid #252a33',
    background: '#13161b',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    textAlign: 'center',
  },
  roleIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.1rem',
    fontWeight: 700,
    background: '#2d7a4a33',
    color: '#6ee7a0',
  },
  roleLabel: {
    fontSize: '1.05rem',
    fontWeight: 600,
    color: '#e0e4ea',
  },
  roleDesc: {
    fontSize: '0.78rem',
    color: '#6b7280',
    lineHeight: '1.4',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: '0.82rem',
    padding: 0,
    marginBottom: '1.25rem',
    transition: 'color 0.15s',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #252a33',
    background: '#13161b',
    color: '#d1d5db',
    fontSize: '0.92rem',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  error: {
    color: '#f08080',
    fontSize: '0.85rem',
    margin: 0,
  },
  submitBtn: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    color: 'white',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    marginTop: '0.25rem',
  },
  toggle: {
    textAlign: 'center',
    marginTop: '1.25rem',
    fontSize: '0.85rem',
    color: '#6b7280',
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: 0,
  },
};

export default LoginPage;
