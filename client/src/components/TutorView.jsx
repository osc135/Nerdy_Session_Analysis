import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';
import { useNudgeEngine } from '../hooks/useNudgeEngine';
import { useAuth } from '../contexts/AuthContext';
import { MetricsHistory } from '../utils/metricsHistory';
import MetricsSidebar from './MetricsSidebar';
import NudgePanel from './NudgePanel';
import VideoLayout from './VideoLayout';

function TutorView() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionType = searchParams.get('type') || 'lecture';
  const sensitivity = searchParams.get('sensitivity') || 'medium';
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
    const data = { ...historyRef.current.getHistory(), sessionType };
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

  // Eye contact tracking + facial expressiveness via MediaPipe
  const { gazeScore, facialEnergy, isReady: mediaPipeReady } = useMediaPipe(localVideoRef, sessionId);

  // Audio analysis for local mic (vocal tone)
  const { isSpeaking, talkTimePercent, volume, vocalTone, getCumulativeMs } = useAudioAnalysis(localStream);

  // Combined energy: 60% facial expressiveness + 40% vocal tone
  const energy = facialEnergy * 0.6 + vocalTone * 0.4;

  // Start history recording only when student joins (first remoteMetrics received)
  const historyStartedRef = useRef(false);
  const [sessionActive, setSessionActive] = useState(false);
  useEffect(() => {
    if (remoteMetrics && !historyStartedRef.current) {
      historyStartedRef.current = true;
      historyRef.current.start();
      setSessionActive(true);
    }
  }, [remoteMetrics]);

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
      if (sendTickRef.current % 4 === 0 && historyStartedRef.current) {
        // Compute attention drift for snapshot only (derived from student metrics, not sent over wire)
        const rm = remoteMetricsRef.current;
        let attentionDrift = null;
        if (rm) {
          const gazeDeficit = 100 - (rm.gazeScore ?? 0);
          const energyDeficit = 100 - Math.round((rm.energy ?? 0) * 100);
          const silenceScore = rm.isSpeaking ? 0 : 100;
          attentionDrift = Math.round(gazeDeficit * 0.4 + energyDeficit * 0.35 + silenceScore * 0.25);
        }
        historyRef.current.addSnapshot({ ...localData, attentionDrift }, remoteMetricsRef.current || {});
      }
    }, 500);
    return () => clearInterval(interval);
  }, [getCumulativeMs, sendMetrics]);

  // Session timer — starts when student joins
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!sessionActive) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [sessionActive]);

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

  // Attention drift: composite disengagement signal from student
  let attentionDrift = null;
  if (hasStudent && remoteMetrics) {
    const gazeDeficit = 100 - studentGaze;
    const energyDeficit = 100 - Math.round((remoteMetrics?.energy ?? 0) * 100);
    const silenceScore = remoteMetrics?.isSpeaking ? 0 : 100;
    attentionDrift = Math.round(gazeDeficit * 0.4 + energyDeficit * 0.35 + silenceScore * 0.25);
  }

  const metrics = {
    tutorEyeContact: gazeScore,
    tutorTalkTime: tutorTalkPercent,
    tutorEnergy: Math.round(energy * 100),
    studentEyeContact: hasStudent ? studentGaze : null,
    studentTalkTime: studentTalkPercent,
    studentEnergy: hasStudent ? Math.round((remoteMetrics?.energy ?? 0) * 100) : null,
    mutualAttention,
    attentionDrift,
    hasStudent,
  };

  // Nudge engine — monitors metrics and fires coaching suggestions
  const nudges = useNudgeEngine({
    localMetrics: { isSpeaking, getCumulativeMs, gazeScore },
    remoteMetrics,
    connectionState,
    elapsed,
    sessionType,
    sensitivity,
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

  return (
    <div style={styles.wrapper}>
      <div style={styles.main}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <h2 style={styles.heading}>Tutor Session</h2>
          <span style={styles.sessionId}>Session: {sessionId}</span>
          <span style={styles.sessionType}>{sessionType}</span>
          <span style={styles.sensitivityBadge}>{sensitivity}</span>
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

        {/* Video call layout: student full-screen, tutor PiP */}
        <VideoLayout
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          connectionState={connectionState}
          localStream={localStream}
          remoteStream={remoteStream}
          localLabel={`You${muted ? ' (Muted)' : ''}`}
          remoteLabel="Student"
          remoteMuted={!!remoteMetrics?.muted}
        />

        {/* Waiting hint — shown below the video area */}
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
  sessionType: {
    color: '#17E2EA',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'capitalize',
    background: 'rgba(23,226,234,0.12)',
    padding: '2px 10px',
    borderRadius: '60px',
  },
  sensitivityBadge: {
    color: '#9E97FF',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'capitalize',
    background: 'rgba(158,151,255,0.12)',
    padding: '2px 10px',
    borderRadius: '60px',
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
    background: 'rgba(255,255,255,0.05)',
    color: '#9ca3af',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '60px',
    padding: '0.4rem 1rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    fontFamily: 'inherit',
  },
  muteBtnActive: {
    background: 'rgba(240,128,128,0.12)',
    color: '#f08080',
    borderColor: 'rgba(240,128,128,0.25)',
  },
  endBtn: {
    background: '#e06060',
    color: '#0F0928',
    border: 'none',
    borderRadius: '60px',
    padding: '0.4rem 1rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },
  hint: {
    marginTop: '1rem',
    color: '#6b7280',
    fontSize: '0.88rem',
    flexShrink: 0,
  },
  code: {
    background: 'rgba(23,226,234,0.1)',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '0.85rem',
    color: '#17E2EA',
    fontFamily: 'monospace',
  },
};

export default TutorView;
