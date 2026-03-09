import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';

function StudentView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { connectionState, localStream, remoteStream, remoteMetrics, sendMetrics, disconnect } = useWebRTC(sessionId, 'student');

  const [muted, setMuted] = useState(false);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = muted; });
    }
    setMuted(!muted);
  };

  // When tutor ends the session, redirect student to home
  useEffect(() => {
    if (connectionState === 'ended') {
      disconnect();
      navigate('/');
    }
  }, [connectionState, disconnect, navigate]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Eye contact tracking via MediaPipe
  const { gazeScore, isReady: mediaPipeReady } = useMediaPipe(localVideoRef, sessionId);

  // Audio analysis for local mic
  const { isSpeaking, talkTimePercent, audioEnergy, getCumulativeMs } = useAudioAnalysis(localStream);

  // Send local metrics over data channel at 1Hz
  useEffect(() => {
    const interval = setInterval(() => {
      const audio = getCumulativeMs();
      sendMetrics({
        gazeScore,
        isSpeaking,
        talkTimePercent,
        audioEnergy,
        speakingMs: audio.speakingMs,
        totalMs: audio.totalMs,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gazeScore, isSpeaking, talkTimePercent, audioEnergy, getCumulativeMs, sendMetrics]);

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
          <span style={styles.label}>Tutor</span>
        </div>
        <div style={styles.localVideoBox}>
          <video ref={localVideoRef} autoPlay muted playsInline style={styles.video} />
          <span style={styles.label}>You</span>
        </div>
      </div>

      {/* Engagement indicators */}
      <div style={styles.engagementBar}>
        <div style={styles.metricRow}>
          <span style={styles.engagementLabel}>Your eye contact</span>
          <div style={styles.scoreRow}>
            <div style={styles.progressTrack}>
              <div style={{
                ...styles.progressFill,
                width: `${gazeScore}%`,
                background: gazeScore >= 60 ? '#3fb950' : gazeScore >= 40 ? '#f0883e' : '#f85149',
              }} />
            </div>
            <span style={{
              ...styles.engagementStatus,
              color: gazeScore >= 60 ? '#3fb950' : gazeScore >= 40 ? '#f0883e' : '#f85149',
            }}>
              {mediaPipeReady ? `${gazeScore}%` : 'Loading...'}
            </span>
          </div>
        </div>
        <div style={styles.metricRow}>
          <span style={styles.engagementLabel}>Your talk time</span>
          <div style={styles.scoreRow}>
            <div style={styles.progressTrack}>
              <div style={{
                ...styles.progressFill,
                width: `${talkTimePercent}%`,
                background: '#58a6ff',
              }} />
            </div>
            <span style={{ ...styles.engagementStatus, color: '#58a6ff' }}>
              {talkTimePercent}%
            </span>
          </div>
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
  engagementBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    marginTop: '1rem',
    padding: '0.75rem 1rem',
    background: '#161b22',
    borderRadius: '8px',
    border: '1px solid #30363d',
    flexShrink: 0,
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  engagementLabel: {
    color: '#8b949e',
    fontSize: '0.85rem',
  },
  engagementStatus: {
    color: '#3fb950',
    fontSize: '0.85rem',
    fontWeight: 600,
    minWidth: '48px',
    textAlign: 'right',
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: 1,
    marginLeft: '1rem',
  },
  progressTrack: {
    flex: 1,
    height: '8px',
    background: '#21262d',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.5s ease, background 0.5s ease',
  },
};

export default StudentView;
