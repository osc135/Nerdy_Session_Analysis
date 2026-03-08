import { useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';

function StudentView() {
  const { sessionId } = useParams();
  const { connectionState, localStream, remoteStream } = useWebRTC(sessionId, 'student');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

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
      <div style={styles.header}>
        <h2>Student Session</h2>
        <span style={styles.sessionId}>Session: {sessionId}</span>
        <span style={{
          ...styles.status,
          color: connectionState === 'connected' ? '#3fb950' : '#f0883e',
        }}>
          {connectionState}
        </span>
      </div>

      <div style={styles.videos}>
        <div style={styles.videoBox}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={styles.video}
          />
          <span style={styles.label}>You</span>
        </div>
        <div style={styles.videoBox}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={styles.video}
          />
          <span style={styles.label}>Tutor</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '1.5rem',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  sessionId: {
    color: '#8b949e',
    fontSize: '0.85rem',
  },
  status: {
    marginLeft: 'auto',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  videos: {
    display: 'flex',
    gap: '1rem',
  },
  videoBox: {
    flex: 1,
    position: 'relative',
    background: '#161b22',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #30363d',
  },
  video: {
    width: '100%',
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
