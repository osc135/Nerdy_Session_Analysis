import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const body = mode === 'signup'
      ? { email, password, name }
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

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Live Session Analysis</h1>
        <p style={styles.subtitle}>AI-Powered Engagement Coaching for Tutoring Sessions</p>

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

          <button type="submit" style={styles.submitBtn}>
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p style={styles.toggle}>
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <button style={styles.toggleBtn} onClick={() => { setMode('signup'); setError(''); }}>
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button style={styles.toggleBtn} onClick={() => { setMode('login'); setError(''); }}>
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
    background: '#161b22',
    borderRadius: '12px',
    padding: '3rem',
    maxWidth: '420px',
    width: '100%',
    border: '1px solid #30363d',
  },
  title: {
    fontSize: '1.8rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    textAlign: 'center',
  },
  subtitle: {
    color: '#8b949e',
    marginBottom: '2rem',
    textAlign: 'center',
    fontSize: '0.9rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #30363d',
    background: '#0d1117',
    color: '#c9d1d9',
    fontSize: '0.95rem',
    outline: 'none',
  },
  error: {
    color: '#f85149',
    fontSize: '0.85rem',
    margin: 0,
  },
  submitBtn: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: '#238636',
    color: 'white',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  toggle: {
    textAlign: 'center',
    marginTop: '1.25rem',
    fontSize: '0.85rem',
    color: '#8b949e',
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#58a6ff',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: 0,
  },
};

export default LoginPage;
