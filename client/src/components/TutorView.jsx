import { useRef, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import MetricsSidebar from './MetricsSidebar';
import NudgePanel from './NudgePanel';

function TutorView() {
  const { sessionId } = useParams();
  const { connectionState, localStream, remoteStream } = useWebRTC(sessionId, 'tutor');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

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

  // Dummy metrics for layout testing
  const dummyMetrics = {
    eyeContact: 72,
    talkTime: 35,
    energy: 61,
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
          <button style={styles.endBtn}>End Session</button>
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
      <MetricsSidebar metrics={dummyMetrics} />

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
