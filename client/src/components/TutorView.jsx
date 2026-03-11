import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';
import { useNudgeEngine } from '../hooks/useNudgeEngine';
import { useAuth } from '../contexts/AuthContext';
import { MetricsHistory } from '../utils/metricsHistory';
import MetricsSidebar from './MetricsSidebar';
import NudgePanel from './NudgePanel';

function TutorView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { connectionState, localStream, remoteStream, remoteMetrics, sendMetrics, disconnect } = useWebRTC(sessionId, 'tutor');

  const [muted, setMuted] = useState(false);
  const [saving, setSaving] = useState(false);
  const historyRef = useRef(new MetricsHistory());

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = muted; });
    }
    setMuted(!muted);
  };

  const handleEndSession = async () => {
    setSaving(true);
    // Capture final snapshot before tearing down
    const audio = getCumulativeMs();
    historyRef.current.addSnapshot(
      { gazeScore, isSpeaking, volume, energy, speakingMs: audio.speakingMs, totalMs: audio.totalMs },
      remoteMetrics || {},
    );
    const data = historyRef.current.getHistory();
    disconnect();
    try {
      await fetch(`/api/sessions/${sessionId}/tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('Failed to save session data:', err);
    }
    navigate(`/report/${sessionId}`);
  };

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Eye contact tracking via MediaPipe
  const { gazeScore, isReady: mediaPipeReady, gazeDebug } = useMediaPipe(localVideoRef, sessionId);

  // Audio analysis for local mic
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

  // Send local metrics over data channel at 500ms
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

  // Track whether we've ever received student data
  const hasStudentRef = useRef(false);
  if (remoteMetrics) hasStudentRef.current = true;
  const hasStudent = hasStudentRef.current;

  // Compute talk time as separate percentages of total session time
  const localAudio = getCumulativeMs();
  const remoteSpeakingMs = remoteMetrics?.speakingMs || 0;
  const sessionTotalMs = localAudio.totalMs || 1;
  const tutorTalkPercent = Math.round((localAudio.speakingMs / sessionTotalMs) * 100);
  const studentTalkPercent = hasStudent ? Math.round((remoteSpeakingMs / sessionTotalMs) * 100) : null;

  // Mutual attention: both looking at camera at the same time
  const studentGaze = remoteMetrics?.gazeScore ?? 0;
  const mutualAttention = hasStudent ? (gazeScore >= 50 && studentGaze >= 50) : null;

  const metrics = {
    tutorEyeContact: gazeScore,
    tutorTalkTime: tutorTalkPercent,
    tutorEnergy: Math.round(energy * 100),
    studentEyeContact: hasStudent ? studentGaze : null,
    studentTalkTime: studentTalkPercent,
    studentEnergy: hasStudent ? Math.round((remoteMetrics?.energy ?? 0) * 100) : null,
    mutualAttention,
    hasStudent,
  };

  // Nudge engine — monitors metrics and fires coaching suggestions
  const nudges = useNudgeEngine({
    localMetrics: { isSpeaking, getCumulativeMs, gazeScore },
    remoteMetrics,
    connectionState,
    elapsed,
  });

  // Record nudges into history as they fire
  const prevNudgeCountRef = useRef(0);
  useEffect(() => {
    if (nudges.length > prevNudgeCountRef.current) {
      for (let i = prevNudgeCountRef.current; i < nudges.length; i++) {
        historyRef.current.addNudge(nudges[i]);
      }
      prevNudgeCountRef.current = nudges.length;
    }
  }, [nudges]);

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
          <button style={styles.endBtn} onClick={handleEndSession}>End Session</button>
        </div>

        {/* Videos */}
        <div style={styles.videos}>
          <div style={styles.videoBox}>
            <video ref={remoteVideoRef} autoPlay playsInline style={styles.video} />
            <span style={styles.label}>Student{remoteMetrics?.muted ? ' (Muted)' : ''}</span>
          </div>
          <div style={styles.localVideoBox}>
            <video ref={localVideoRef} autoPlay muted playsInline style={styles.video} />
            <span style={styles.label}>You{muted ? ' (Muted)' : ''}</span>
          </div>
        </div>

        {/* Waiting hint */}
        {connectionState === 'waiting' && (
          <p style={styles.hint}>
            Share this code with the student:{' '}
            <code style={styles.code}>{sessionId}</code>
          </p>
        )}
      </div>

      {/* Sidebar */}
      <MetricsSidebar metrics={metrics} />

      {/* Nudge toasts */}
      <NudgePanel nudges={nudges} />

      {/* Gaze debug overlay — remove after tuning */}
      {gazeDebug && (
        <div style={styles.debugOverlay}>
          <div>contact: {gazeDebug.contact} | conf: {gazeDebug.confidence}</div>
          <div>yaw: {gazeDebug.yaw}° pitch: {gazeDebug.pitch}°</div>
          <div>iris devX: {gazeDebug.irisX} devY: {gazeDebug.irisY}</div>
        </div>
      )}
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
  endBtn: {
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
  videos: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    minHeight: 0,
  },
  videoBox: {
    flex: 1,
    position: 'relative',
    background: '#181c24',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid #252a33',
    minHeight: 0,
  },
  localVideoBox: {
    flex: 1,
    position: 'relative',
    background: '#181c24',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid #252a33',
    minHeight: 0,
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
    background: 'rgba(0,0,0,0.5)',
    padding: '3px 10px',
    borderRadius: '5px',
    fontSize: '0.78rem',
    color: '#b0b8c4',
  },
  hint: {
    marginTop: '1rem',
    color: '#6b7280',
    fontSize: '0.88rem',
    flexShrink: 0,
  },
  code: {
    background: '#1e232d',
    padding: '3px 8px',
    borderRadius: '5px',
    fontSize: '0.85rem',
    color: '#7ab8e0',
  },
  debugOverlay: {
    position: 'fixed',
    bottom: '10px',
    left: '10px',
    background: 'rgba(0,0,0,0.85)',
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '8px 12px',
    borderRadius: '6px',
    lineHeight: 1.6,
    zIndex: 9999,
  },
};

export default TutorView;
