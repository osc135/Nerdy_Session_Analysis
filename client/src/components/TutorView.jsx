import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';
import MetricsSidebar from './MetricsSidebar';
import NudgePanel from './NudgePanel';

function TutorView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { connectionState, localStream, remoteStream, remoteMetrics, sendMetrics, disconnect } = useWebRTC(sessionId, 'tutor');

  const [muted, setMuted] = useState(false);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = muted; });
    }
    setMuted(!muted);
  };

  const handleEndSession = () => {
    disconnect();
    navigate('/');
  };

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

  // Compute talk time balance from both sides
  const localAudio = getCumulativeMs();
  const remoteSpeakingMs = remoteMetrics?.speakingMs || 0;
  const totalSpeakingMs = localAudio.speakingMs + remoteSpeakingMs;
  const tutorTalkPercent = totalSpeakingMs > 0
    ? Math.round((localAudio.speakingMs / totalSpeakingMs) * 100)
    : 0;
  const studentTalkPercent = totalSpeakingMs > 0
    ? 100 - tutorTalkPercent
    : 0;

  const metrics = {
    eyeContact: gazeScore,
    tutorTalkTime: tutorTalkPercent,
    studentTalkTime: studentTalkPercent,
    energy: Math.round(audioEnergy * 100),
  };

  // Dummy nudges for layout testing
  const dummyNudges = [
    { message: 'Try asking the student an open-ended question to check understanding.', timestamp: '2:15' },
  ];

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
    <div style={styles.wrapper}>
      <div style={styles.main}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <h2 style={styles.heading}>Tutor Session</h2>
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
          <button style={styles.endBtn} onClick={handleEndSession}>End Session</button>
        </div>

        {/* Videos */}
        <div style={styles.videos}>
          <div style={styles.videoBox}>
            <video ref={remoteVideoRef} autoPlay playsInline style={styles.video} />
            <span style={styles.label}>Student</span>
          </div>
          <div style={styles.localVideoBox}>
            <video ref={localVideoRef} autoPlay muted playsInline style={styles.video} />
            <span style={styles.label}>You</span>
          </div>
        </div>

        {/* Waiting hint */}
        {connectionState === 'waiting' && (
          <p style={styles.hint}>
            Share this link with the student:{' '}
            <code style={styles.code}>
              {window.location.origin}/student/{sessionId}
            </code>
          </p>
        )}
      </div>

      {/* Sidebar */}
      <MetricsSidebar metrics={metrics} />

      {/* Nudge toasts */}
      <NudgePanel nudges={dummyNudges} />
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
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
  endBtn: {
    background: '#da3633',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '0.4rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
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
  hint: {
    marginTop: '1rem',
    color: '#8b949e',
    fontSize: '0.9rem',
    flexShrink: 0,
  },
  code: {
    background: '#161b22',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '0.85rem',
    color: '#58a6ff',
  },
};

export default TutorView;
