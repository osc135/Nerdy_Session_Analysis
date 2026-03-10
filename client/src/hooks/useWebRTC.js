import { useState, useEffect, useRef, useCallback } from 'react';

const STUN_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export function useWebRTC(sessionId, role) {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteMetrics, setRemoteMetrics] = useState(null);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);

  // Send metrics over the data channel
  const sendMetrics = useCallback((metrics) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(metrics));
    }
  }, []);

  // End the session: notify the other peer, then tear everything down
  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'session_ending' }));
    }
    dataChannelRef.current?.close();
    pcRef.current?.close();
    wsRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    setConnectionState('disconnected');
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  useEffect(() => {
    if (!sessionId || !role) return;

    let cancelled = false;

    async function start() {
      // 1. Get camera and mic
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2. Create peer connection
      const pc = new RTCPeerConnection(STUN_SERVERS);
      pcRef.current = pc;

      // Add local tracks to the connection
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // When we receive remote tracks, capture them
      const remote = new MediaStream();
      setRemoteStream(remote);

      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remote.addTrack(track);
        });
      };

      // Track connection state — only update for meaningful transitions
      // so we don't overwrite our custom 'waiting' state with PC states like 'new'
      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        const state = pc.connectionState;
        if (state === 'connected' || state === 'failed' || state === 'closed' || state === 'disconnected') {
          setConnectionState(state === 'closed' ? 'disconnected' : state);
        }
      };

      // 3. Set up data channel (tutor creates, student receives)
      if (role === 'tutor') {
        const dc = pc.createDataChannel('metrics');
        dataChannelRef.current = dc;
        dc.onmessage = (e) => setRemoteMetrics(JSON.parse(e.data));
      } else {
        pc.ondatachannel = (event) => {
          dataChannelRef.current = event.channel;
          event.channel.onmessage = (e) => setRemoteMetrics(JSON.parse(e.data));
        };
      }

      // 4. Connect to signaling server
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        ws.send(JSON.stringify({ type: 'join', sessionId, role }));
        setConnectionState('waiting');
      };

      // Buffer ICE candidates until we can send them
      const iceCandidateQueue = [];

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN && !cancelled) {
          ws.send(
            JSON.stringify({ type: 'ice-candidate', candidate: event.candidate })
          );
        }
      };

      ws.onmessage = async (event) => {
        if (cancelled) return;
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'peer_joined': {
            // Tutor initiates the offer when the student joins
            if (role === 'tutor') {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              ws.send(JSON.stringify({ type: 'offer', offer }));
            }
            break;
          }

          case 'offer': {
            // Student receives the offer and sends an answer
            await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
            // Apply any queued ICE candidates
            for (const c of iceCandidateQueue) {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            iceCandidateQueue.length = 0;

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', answer }));
            break;
          }

          case 'answer': {
            // Tutor receives the answer
            await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
            // Apply any queued ICE candidates
            for (const c of iceCandidateQueue) {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            iceCandidateQueue.length = 0;
            break;
          }

          case 'ice-candidate': {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } else {
              // Queue until remote description is set
              iceCandidateQueue.push(msg.candidate);
            }
            break;
          }

          case 'peer_left':
          case 'session_ending': {
            setConnectionState('ended');
            break;
          }
        }
      };

      ws.onclose = () => {
        if (!cancelled) setConnectionState('disconnected');
      };
    }

    start().catch((err) => {
      console.error('useWebRTC error:', err);
      if (!cancelled) setConnectionState('failed');
    });

    // Cleanup on unmount
    return () => {
      cancelled = true;
      dataChannelRef.current?.close();
      pcRef.current?.close();
      wsRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [sessionId, role]);

  return { connectionState, localStream, remoteStream, remoteMetrics, sendMetrics, disconnect };
}
