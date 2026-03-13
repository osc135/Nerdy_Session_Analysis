import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [hoveredRole, setHoveredRole] = useState(null);

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

  // Landing / role selection
  if (!role) {
    return (
      <div style={styles.page}>
        <div style={styles.bgOrb1} />
        <div style={styles.bgOrb2} />
        <div style={styles.bgOrb3} />

        <div style={styles.landing}>
          <p style={styles.badge}>Live Session Analysis</p>

          <h1 style={styles.hero}>
            <em style={styles.heroItalic}>The</em> smarter way<br />
            to <span style={styles.heroGradient}>tutor.</span>
          </h1>

          <p style={styles.tagline}>
            Real-time engagement coaching that helps you connect with students and improve every session.
          </p>

          <div style={styles.roleButtons}>
            <button
              style={{
                ...styles.roleCard,
                borderColor: hoveredRole === 'tutor' ? '#17E2EA44' : 'rgba(255,255,255,0.08)',
                background: hoveredRole === 'tutor' ? 'rgba(23,226,234,0.06)' : 'rgba(255,255,255,0.04)',
                boxShadow: hoveredRole === 'tutor' ? '0 16px 48px rgba(23,226,234,0.12)' : 'none',
              }}
              onClick={() => setRole('tutor')}
              onMouseEnter={() => setHoveredRole('tutor')}
              onMouseLeave={() => setHoveredRole(null)}
            >
              <div style={{ ...styles.roleIcon, background: 'rgba(23,226,234,0.12)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#17E2EA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <path d="M12 11v4M10 13h4" />
                </svg>
              </div>
              <span style={styles.roleLabel}>I'm a Tutor</span>
              <span style={styles.roleDesc}>Lead a session and get live coaching</span>
              <span style={{
                ...styles.roleCTA,
                opacity: hoveredRole === 'tutor' ? 1 : 0,
              }}>Get started &rarr;</span>
            </button>

            <button
              style={{
                ...styles.roleCard,
                borderColor: hoveredRole === 'student' ? '#9E97FF44' : 'rgba(255,255,255,0.08)',
                background: hoveredRole === 'student' ? 'rgba(158,151,255,0.06)' : 'rgba(255,255,255,0.04)',
                boxShadow: hoveredRole === 'student' ? '0 16px 48px rgba(158,151,255,0.12)' : 'none',
              }}
              onClick={() => setRole('student')}
              onMouseEnter={() => setHoveredRole('student')}
              onMouseLeave={() => setHoveredRole(null)}
            >
              <div style={{ ...styles.roleIcon, background: 'rgba(158,151,255,0.12)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9E97FF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5" />
                </svg>
              </div>
              <span style={styles.roleLabel}>I'm a Student</span>
              <span style={styles.roleDesc}>Join your tutor's session</span>
              <span style={{
                ...styles.roleCTA,
                color: '#9E97FF',
                opacity: hoveredRole === 'student' ? 1 : 0,
              }}>Join now &rarr;</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Auth form
  const isTutor = role === 'tutor';
  const accent = isTutor ? '#17E2EA' : '#9E97FF';

  return (
    <div style={styles.page}>
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />

      <div style={styles.formCard}>
        <button style={styles.backBtn} onClick={() => { setRole(null); setError(''); setMode('login'); }}>
          &larr; Back
        </button>

        <h1 style={styles.formTitle}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p style={styles.formSub}>
          {mode === 'signup'
            ? `Sign up as a ${isTutor ? 'tutor' : 'student'} to get started.`
            : `Sign in to your ${isTutor ? 'tutor' : 'student'} account.`}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Your name"
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

          <button
            type="submit"
            style={{
              ...styles.submitBtn,
              background: accent,
              boxShadow: `0 4px 24px ${accent}40`,
            }}
          >
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p style={styles.toggle}>
          {mode === 'login' ? (
            <>New here?{' '}
              <button style={{ ...styles.toggleBtn, color: accent }} onClick={() => { setMode('signup'); setError(''); }}>
                Create an account
              </button>
            </>
          ) : (
            <>Have an account?{' '}
              <button style={{ ...styles.toggleBtn, color: accent }} onClick={() => { setMode('login'); setError(''); }}>
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
  page: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
    position: 'relative',
    overflow: 'hidden',
  },

  // Ambient orbs — Nerdy-style purple/cyan glow
  bgOrb1: {
    position: 'absolute',
    top: '-30%',
    left: '-15%',
    width: '700px',
    height: '700px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(60,76,219,0.15) 0%, transparent 60%)',
    pointerEvents: 'none',
    filter: 'blur(60px)',
  },
  bgOrb2: {
    position: 'absolute',
    bottom: '-30%',
    right: '-15%',
    width: '800px',
    height: '800px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(23,226,234,0.1) 0%, transparent 60%)',
    pointerEvents: 'none',
    filter: 'blur(60px)',
  },
  bgOrb3: {
    position: 'absolute',
    top: '20%',
    right: '10%',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(158,151,255,0.08) 0%, transparent 60%)',
    pointerEvents: 'none',
    filter: 'blur(50px)',
  },

  // Landing
  landing: {
    textAlign: 'center',
    maxWidth: '580px',
    width: '100%',
    position: 'relative',
    zIndex: 1,
  },
  badge: {
    display: 'inline-block',
    padding: '6px 16px',
    borderRadius: '60px',
    background: 'linear-gradient(135deg, rgba(60,76,219,0.25), rgba(158,151,255,0.2))',
    border: '1px solid rgba(158,151,255,0.2)',
    color: '#c4bfff',
    fontSize: '0.78rem',
    fontWeight: 500,
    letterSpacing: '0.02em',
    marginBottom: '1.75rem',
  },
  hero: {
    fontSize: '3.2rem',
    fontWeight: 800,
    lineHeight: 1.1,
    color: '#ffffff',
    margin: '0 0 1.25rem',
    letterSpacing: '-0.02em',
  },
  heroItalic: {
    fontStyle: 'italic',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
  },
  heroGradient: {
    background: 'linear-gradient(135deg, #FFC32B, #FB43DA, #9E97FF, #17E2EA)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  tagline: {
    fontSize: '1.05rem',
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.65,
    marginBottom: '3rem',
    maxWidth: '440px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },

  // Role cards
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
    padding: '2rem 1.25rem 1.75rem',
    borderRadius: '20px',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    backdropFilter: 'blur(20px)',
  },
  roleIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleLabel: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#ffffff',
  },
  roleDesc: {
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.5,
  },
  roleCTA: {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: '#17E2EA',
    marginTop: '0.25rem',
    transition: 'opacity 0.3s ease',
  },

  // Auth form
  formCard: {
    background: 'rgba(15,9,40,0.8)',
    borderRadius: '20px',
    padding: '2.5rem',
    maxWidth: '420px',
    width: '100%',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)',
    position: 'relative',
    zIndex: 1,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: 0,
    marginBottom: '1.75rem',
    transition: 'color 0.15s',
  },
  formTitle: {
    fontSize: '1.6rem',
    fontWeight: 700,
    margin: '0 0 0.4rem',
    color: '#ffffff',
  },
  formSub: {
    color: 'rgba(255,255,255,0.4)',
    marginBottom: '1.75rem',
    fontSize: '0.9rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  input: {
    padding: '0.85rem 1rem',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e2e8f0',
    fontSize: '0.92rem',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  },
  error: {
    color: '#f87171',
    fontSize: '0.85rem',
    margin: 0,
  },
  submitBtn: {
    padding: '0.85rem',
    borderRadius: '60px',
    border: 'none',
    color: '#0F0928',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.5rem',
    transition: 'transform 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  },
  toggle: {
    textAlign: 'center',
    marginTop: '1.5rem',
    fontSize: '0.85rem',
    color: 'rgba(255,255,255,0.35)',
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: 0,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
};

export default LoginPage;
