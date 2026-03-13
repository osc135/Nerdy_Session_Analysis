import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';
import { useAuth } from '../contexts/AuthContext';
import { MetricsHistory } from '../utils/metricsHistory';
import VideoLayout from './VideoLayout';

function StudentView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { connectionState, localStream, remoteStream, remoteMetrics, sendMetrics, disconnect } = useWebRTC(sessionId, 'student');

  const [muted, setMuted] = useState(false);
  const [saving, setSaving] = useState(false);
  const historyRef = useRef(new MetricsHistory());

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = muted; });
    }
    setMuted(!muted);
  };

  const handleLeave = () => {
    const data = historyRef.current.getHistory();
    disconnect();
    fetch(`/api/sessions/${sessionId}/student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }).catch(err => console.error('Failed to save session data:', err));
    navigate('/dashboard');
  };

  const [sessionEnded, setSessionEnded] = useState(false);

  // When tutor ends the session, save data and show ended screen
  useEffect(() => {
    if (connectionState === 'ended' && !saving) {
      setSaving(true);
      const data = historyRef.current.getHistory();
      disconnect();
      fetch(`/api/sessions/${sessionId}/student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      })
        .catch(err => console.error('Failed to save session data:', err))
        .finally(() => setSessionEnded(true));
    }
  }, [connectionState, saving, disconnect, sessionId]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Eye contact tracking + facial expressiveness via MediaPipe
  const { gazeScore, facialEnergy } = useMediaPipe(localVideoRef, sessionId);

  // Audio analysis for local mic (vocal tone)
  const { isSpeaking, talkTimePercent, volume, vocalTone, getCumulativeMs } = useAudioAnalysis(localStream);

  // Combined energy: 60% facial expressiveness + 40% vocal tone
  const energy = facialEnergy * 0.6 + vocalTone * 0.4;

  // Start history recording when connected
  useEffect(() => {
    if (connectionState === 'connected') {
      historyRef.current.start();
    }
  }, [connectionState]);

  // Keep latest values in refs so the send interval stays stable
  const latestRef = useRef({ gazeScore: 0, isSpeaking: false, talkTimePercent: 0, volume: 0, energy: 0, muted: false });
  latestRef.current = { gazeScore, isSpeaking, talkTimePercent, volume, energy, muted };
  const remoteMetricsRef = useRef(null);
  remoteMetricsRef.current = remoteMetrics;
  const connectionStateRef = useRef(connectionState);
  connectionStateRef.current = connectionState;

  // Send local metrics over data channel so tutor can see them
  // Record snapshots for report at 2s (every 4th tick)
  const sendTickRef = useRef(0);
  useEffect(() => {
    const interval = setInterval(() => {
      const audio = getCumulativeMs();
      const m = latestRef.current;
      const localData = {
        gazeScore: m.gazeScore,
        isSpeaking: m.isSpeaking,
        talkTimePercent: m.talkTimePercent,
        volume: m.volume,
        energy: m.energy,
        muted: m.muted,
        speakingMs: audio.speakingMs,
        totalMs: audio.totalMs,
      };
      sendMetrics(localData);

      sendTickRef.current++;
      if (sendTickRef.current % 4 === 0 && connectionStateRef.current === 'connected') {
        historyRef.current.addSnapshot(localData, remoteMetricsRef.current || {});
      }
    }, 500);
    return () => clearInterval(interval);
  }, [getCumulativeMs, sendMetrics]);

  // Session timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (sessionEnded) {
    return (
      <div style={styles.endedContainer}>
        <div style={styles.endedCard}>
          <h2 style={styles.endedTitle}>Session Ended</h2>
          <p style={styles.endedText}>Thanks for participating! Your tutor will review the session analytics.</p>
          <button style={styles.endedBtn} onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <h2 style={styles.heading}>Student Session</h2>
        <span style={styles.sessionId}>Session: {sessionId}</span>
        <span style={styles.timer}>{formatTime(elapsed)}</span>
        <span style={{
          ...styles.status,
          color: connectionState === 'connected' ? '#6ee7a0' : '#e8985a',
        }}>
          {connectionState}
        </span>
        <button
          style={muted ? { ...styles.muteBtn, ...styles.muteBtnActive } : styles.muteBtn}
          onClick={toggleMute}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button style={styles.leaveBtn} onClick={handleLeave}>Leave</button>
      </div>

      {/* Video call layout: tutor full-screen, student PiP */}
      <VideoLayout
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        connectionState={connectionState}
        localStream={localStream}
        remoteStream={remoteStream}
        localLabel={`You${muted ? ' (Muted)' : ''}`}
        remoteLabel="Tutor"
        remoteMuted={!!remoteMetrics?.muted}
      />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    padding: '1rem',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '0.75rem',
    flexShrink: 0,
  },
  heading: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: '#e0e4ea',
  },
  sessionId: {
    color: '#6b7280',
    fontSize: '0.8rem',
  },
  timer: {
    color: '#d1d5db',
    fontSize: '0.9rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  status: {
    marginLeft: 'auto',
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  muteBtn: {
    background: '#1e232d',
    color: '#9ca3af',
    border: '1px solid #252a33',
    borderRadius: '6px',
    padding: '0.4rem 1rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  muteBtnActive: {
    background: '#3b1a1a',
    color: '#f08080',
    borderColor: '#5c2a2a',
  },
  leaveBtn: {
    background: '#c23b3b',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '0.4rem 1rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  endedContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
  },
  endedCard: {
    background: '#181c24',
    borderRadius: '14px',
    padding: '3rem',
    maxWidth: '440px',
    width: '100%',
    border: '1px solid #252a33',
    textAlign: 'center',
  },
  endedTitle: {
    fontSize: '1.4rem',
    fontWeight: 600,
    color: '#e0e4ea',
    marginBottom: '0.75rem',
  },
  endedText: {
    color: '#6b7280',
    fontSize: '0.92rem',
    lineHeight: 1.5,
    marginBottom: '1.5rem',
  },
  endedBtn: {
    background: '#2d7a4a',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};

export default StudentView;
