import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';
import { useAuth } from '../contexts/AuthContext';
import { MetricsHistory } from '../utils/metricsHistory';

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

  // When tutor ends the session, save data and redirect to report
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
        .finally(() => navigate(`/report/${sessionId}`));
    }
  }, [connectionState, saving, disconnect, navigate, sessionId]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Eye contact tracking via MediaPipe (still needed — sends to tutor)
  const { gazeScore } = useMediaPipe(localVideoRef, sessionId);

  // Audio analysis for local mic (still needed — sends to tutor)
  const { isSpeaking, talkTimePercent, volume, energy, getCumulativeMs } = useAudioAnalysis(localStream);

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

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <h2 style={styles.heading}>Student Session</h2>
        <span style={styles.sessionId}>Session: {sessionId}</span>
        <span style={styles.timer}>{formatTime(elapsed)}</span>
        <span style={{
          ...styles.status,
          color: connectionState === 'connected' ? '#3fb950' : '#f0883e',
        }}>
          {connectionState}
        </span>
        <button
          style={muted ? { ...styles.muteBtn, ...styles.muteBtnActive } : styles.muteBtn}
          onClick={toggleMute}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </div>

      {/* Videos */}
      <div style={styles.videos}>
        <div style={styles.videoBox}>
          <video ref={remoteVideoRef} autoPlay playsInline style={styles.video} />
          <span style={styles.label}>Tutor{remoteMetrics?.muted ? ' (Muted)' : ''}</span>
        </div>
        <div style={styles.localVideoBox}>
          <video ref={localVideoRef} autoPlay muted playsInline style={styles.video} />
          <span style={styles.label}>You{muted ? ' (Muted)' : ''}</span>
        </div>
      </div>
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
    marginBottom: '1rem',
    flexShrink: 0,
  },
  heading: {
    margin: 0,
    fontSize: '1.1rem',
  },
  sessionId: {
    color: '#8b949e',
    fontSize: '0.8rem',
  },
  timer: {
    color: '#e6edf3',
    fontSize: '0.9rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  status: {
    marginLeft: 'auto',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  muteBtn: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '0.4rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  muteBtnActive: {
    background: '#f8514933',
    color: '#f85149',
    borderColor: '#f85149',
  },
  videos: {
    flex: 1,
    display: 'flex',
    gap: '1rem',
    minHeight: 0,
  },
  videoBox: {
    flex: 3,
    position: 'relative',
    background: '#161b22',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #30363d',
  },
  localVideoBox: {
    flex: 1,
    position: 'relative',
    background: '#161b22',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #30363d',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  label: {
    position: 'absolute',
    bottom: '8px',
    left: '8px',
    background: 'rgba(0,0,0,0.6)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.8rem',
  },
};

export default StudentView;
