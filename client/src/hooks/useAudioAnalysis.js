import { useState, useEffect, useRef, useCallback } from 'react';

const SILENCE_THRESHOLD = 0.008;
const CHECK_INTERVAL = 100; // ms

export function useAudioAnalysis(stream) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [talkTimePercent, setTalkTimePercent] = useState(0);
  const [audioEnergy, setAudioEnergy] = useState(0);

  const contextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingMsRef = useRef(0);
  const totalMsRef = useRef(0);

  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;

    const audioContext = new AudioContext();
    contextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Float32Array(analyser.fftSize);

    const interval = setInterval(() => {
      analyser.getFloatTimeDomainData(dataArray);

      // Calculate RMS (root mean square) volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      const speaking = rms > SILENCE_THRESHOLD;
      setIsSpeaking(speaking);
      setAudioEnergy(Math.min(rms * 20, 1)); // normalize 0-1, amplified for sensitivity

      totalMsRef.current += CHECK_INTERVAL;
      if (speaking) {
        speakingMsRef.current += CHECK_INTERVAL;
      }

      const percent = totalMsRef.current > 0
        ? Math.round((speakingMsRef.current / totalMsRef.current) * 100)
        : 0;
      setTalkTimePercent(percent);
    }, CHECK_INTERVAL);

    return () => {
      clearInterval(interval);
      source.disconnect();
      audioContext.close();
    };
  }, [stream]);

  // Expose cumulative ms for data channel sharing
  const getCumulativeMs = useCallback(() => ({
    speakingMs: speakingMsRef.current,
    totalMs: totalMsRef.current,
  }), []);

  return { isSpeaking, talkTimePercent, audioEnergy, getCumulativeMs };
}
