// useWebRTC.js — Peer connection + data channel for metric sharing
// Handles WebSocket signaling, WebRTC offer/answer/ICE,
// and a data channel for sending metric objects at 1Hz

import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebRTC(sessionId, role) {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteMetrics, setRemoteMetrics] = useState(null);

  // TODO: Connect to signaling server via WebSocket
  // TODO: Create RTCPeerConnection with STUN servers
  // TODO: Handle offer/answer/ICE exchange
  // TODO: Set up data channel for metric sharing

  const sendMetrics = useCallback((metrics) => {
    // TODO: Send via data channel
  }, []);

  return { connectionState, remoteStream, remoteMetrics, sendMetrics };
}
