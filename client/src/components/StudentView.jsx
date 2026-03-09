import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';

function StudentView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { connectionState, localStream, remoteStream, disconnect } = useWebRTC(sessionId, 'student');

  // When tutor ends the session, redirect student to home
  useEffect(() => {
    if (connectionState === 'ended') {
      disconnect();
      navigate('/');
    }
  }, [connectionState, disconnect, navigate]);

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
        <span style={styles.endNote}>Tutor controls session</span>
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

      {/* Simple engagement indicator */}
      <div style={styles.engagementBar}>
        <span style={styles.engagementLabel}>Your engagement</span>
        <span style={styles.engagementStatus}>Looking good!</span>
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
  endNote: {
    color: '#8b949e',
    fontSize: '0.8rem',
    fontStyle: 'italic',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '1rem',
    padding: '0.75rem 1rem',
    background: '#161b22',
    borderRadius: '8px',
    border: '1px solid #30363d',
    flexShrink: 0,
  },
  engagementLabel: {
    color: '#8b949e',
    fontSize: '0.85rem',
  },
  engagementStatus: {
    color: '#3fb950',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
};

export default StudentView;
