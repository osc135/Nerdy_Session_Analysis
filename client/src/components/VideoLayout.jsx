import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * VideoLayout — video-call screen with remote participant as the primary
 * full-screen view and local camera as a floating PiP overlay.
 *
 * Props:
 *   localVideoRef   – React ref attached to the local <video> element (needed
 *                      externally for MediaPipe analysis)
 *   remoteVideoRef  – React ref attached to the remote <video> element
 *   connectionState – 'waiting' | 'connected' | 'disconnected' | 'failed' | 'ended'
 *   localStream     – MediaStream (or null if camera not yet acquired)
 *   remoteStream    – MediaStream (or null if peer not yet connected)
 *   localLabel      – e.g. "You (Muted)"
 *   remoteLabel     – e.g. "Student"
 *   remoteMuted     – whether remote participant is muted (for label badge)
 */
function VideoLayout({
  localVideoRef,
  remoteVideoRef,
  connectionState,
  localStream,
  remoteStream,
  localLabel = 'You',
  remoteLabel = 'Remote',
  remoteMuted = false,
}) {
  // ── PiP drag state ──────────────────────────────────────────────────
  const pipRef = useRef(null);
  const dragState = useRef({ dragging: false, offsetX: 0, offsetY: 0 });
  const [pipPos, setPipPos] = useState({ right: 16, bottom: 16 });

  const onPointerDown = useCallback((e) => {
    const pip = pipRef.current;
    if (!pip) return;
    e.preventDefault();
    const rect = pip.getBoundingClientRect();
    dragState.current = {
      dragging: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    pip.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragState.current.dragging) return;
    const pip = pipRef.current;
    if (!pip) return;
    const parent = pip.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const pipW = pip.offsetWidth;
    const pipH = pip.offsetHeight;

    // Calculate position from bottom-right (our anchor corner)
    let newRight = parentRect.right - e.clientX - (pipW - dragState.current.offsetX);
    let newBottom = parentRect.bottom - e.clientY - (pipH - dragState.current.offsetY);

    // Clamp within parent bounds
    newRight = Math.max(8, Math.min(newRight, parentRect.width - pipW - 8));
    newBottom = Math.max(8, Math.min(newBottom, parentRect.height - pipH - 8));

    setPipPos({ right: newRight, bottom: newBottom });
  }, []);

  const onPointerUp = useCallback((e) => {
    dragState.current.dragging = false;
    pipRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  // ── Attach streams to video elements ────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, localVideoRef]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, remoteVideoRef]);

  // ── Derived state ───────────────────────────────────────────────────
  const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
  const hasLocalVideo = localStream && localStream.getVideoTracks().length > 0;
  const isWaiting = connectionState === 'waiting';
  const isEnded = connectionState === 'ended';
  const isReconnecting = connectionState === 'disconnected' || connectionState === 'failed';
  const showVideo = hasRemoteVideo && !isWaiting && !isEnded;

  return (
    <div style={styles.container}>
      {/* ── Primary view: remote participant ─────────────────────────── */}
      <div style={styles.remoteWrapper}>
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            ...styles.remoteVideo,
            opacity: showVideo ? 1 : 0,
          }}
        />

        {/* Overlay states rendered on top of the remote video area */}
        {isWaiting && (
          <div style={styles.statePlaceholder}>
            <div style={styles.placeholderPulse} />
            <span style={styles.placeholderText}>Waiting for participant to join...</span>
          </div>
        )}

        {isEnded && (
          <div style={styles.statePlaceholder}>
            <div style={styles.disconnectedIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9E97FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="17" y1="11" x2="23" y2="11" />
              </svg>
            </div>
            <span style={styles.placeholderText}>{remoteLabel} disconnected</span>
          </div>
        )}

        {isReconnecting && !isWaiting && (
          <div style={styles.statePlaceholder}>
            <div style={styles.spinner} />
            <span style={styles.placeholderText}>Reconnecting...</span>
          </div>
        )}

        {!isWaiting && !isEnded && !isReconnecting && !hasRemoteVideo && connectionState === 'connected' && (
          <div style={styles.statePlaceholder}>
            <div style={styles.cameraOffIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5">
                <path d="M16.5 12V9a4.5 4.5 0 00-9 0v3m-2.25 0h13.5a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-6a1.5 1.5 0 011.5-1.5z" />
              </svg>
            </div>
            <span style={styles.placeholderText}>Camera off</span>
          </div>
        )}

        {/* Remote label — only show when connected */}
        {connectionState === 'connected' && (
          <span style={styles.remoteLabel}>
            {remoteLabel}{remoteMuted ? ' (Muted)' : ''}
          </span>
        )}
      </div>

      {/* ── PiP self-preview overlay ─────────────────────────────────── */}
      {/* Always render a single <video> element so the ref stays stable
          for MediaPipe analysis. Hide the wrapper when there's no stream. */}
      <div
        ref={pipRef}
        style={{
          ...styles.pip,
          right: pipPos.right,
          bottom: pipPos.bottom,
          visibility: hasLocalVideo ? 'visible' : 'hidden',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <video
          ref={localVideoRef}
          autoPlay
          muted          /* Always muted — prevents audio feedback */
          playsInline
          style={styles.pipVideo}
        />
        <span style={styles.pipLabel}>{localLabel}</span>
      </div>
    </div>
  );
}

// ── Keyframes via a <style> tag injected once ───────────────────────────
const KEYFRAMES_ID = 'video-layout-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(KEYFRAMES_ID)) {
  const styleEl = document.createElement('style');
  styleEl.id = KEYFRAMES_ID;
  styleEl.textContent = `
    @keyframes vl-pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.05); }
    }
    @keyframes vl-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleEl);
}

const styles = {
  container: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    background: '#0F0928',
    borderRadius: '16px',
    overflow: 'hidden',
  },

  // ── Remote (primary) ──────────────────────────────────────────────
  remoteWrapper: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    transition: 'opacity 0.3s ease',
  },
  remoteLabel: {
    position: 'absolute',
    bottom: '12px',
    left: '12px',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    color: '#c8cdd5',
    fontWeight: 500,
    letterSpacing: '0.01em',
  },

  // ── Placeholder states ────────────────────────────────────────────
  statePlaceholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    background: '#0F0928',
  },
  placeholderPulse: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: 'rgba(23,226,234,0.15)',
    animation: 'vl-pulse 2s ease-in-out infinite',
  },
  placeholderText: {
    color: '#6b7280',
    fontSize: '0.88rem',
    fontWeight: 500,
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: '2.5px solid rgba(255,255,255,0.06)',
    borderTopColor: '#17E2EA',
    borderRadius: '50%',
    animation: 'vl-spin 0.8s linear infinite',
  },
  cameraOffIcon: {
    opacity: 0.5,
  },
  disconnectedIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(158,151,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── PiP (self-preview) ────────────────────────────────────────────
  pip: {
    position: 'absolute',
    width: '180px',
    aspectRatio: '4 / 3',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '2px solid rgba(255,255,255,0.1)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    cursor: 'grab',
    zIndex: 10,
    transition: 'box-shadow 0.2s ease',
    touchAction: 'none',    /* Needed for pointer events drag on mobile */
    userSelect: 'none',
  },
  pipVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    transform: 'scaleX(-1)',   /* Mirror self-view — feels natural */
  },
  pipLabel: {
    position: 'absolute',
    bottom: '4px',
    left: '6px',
    background: 'rgba(0,0,0,0.5)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    color: '#b0b8c4',
    fontWeight: 500,
  },
};

export default VideoLayout;
