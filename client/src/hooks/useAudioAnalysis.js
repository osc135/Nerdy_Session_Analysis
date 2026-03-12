import { useState, useEffect, useRef, useCallback } from 'react';

const SILENCE_THRESHOLD = 0.008;
const CHECK_INTERVAL = 100; // ms
const ENERGY_WINDOW_MS = 5000; // 5-second rolling window for energy calculation
const ENERGY_WINDOW_SIZE = ENERGY_WINDOW_MS / CHECK_INTERVAL; // 50 samples

export function useAudioAnalysis(stream) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [talkTimePercent, setTalkTimePercent] = useState(0);
  const [volume, setVolume] = useState(0);
  const [vocalTone, setVocalTone] = useState(0);

  const contextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingMsRef = useRef(0);
  const totalMsRef = useRef(0);

  // Rolling window buffers for energy calculation
  const rmsHistoryRef = useRef([]);
  const pitchHistoryRef = useRef([]);

  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;

    const audioContext = new AudioContext();
    contextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // larger FFT for better pitch resolution
    source.connect(analyser);
    analyserRef.current = analyser;

    const timeData = new Float32Array(analyser.fftSize);
    const freqData = new Float32Array(analyser.frequencyBinCount);

    const interval = setInterval(() => {
      // --- Volume (RMS) ---
      analyser.getFloatTimeDomainData(timeData);

      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        sum += timeData[i] * timeData[i];
      }
      const rms = Math.sqrt(sum / timeData.length);

      const speaking = rms > SILENCE_THRESHOLD;
      setIsSpeaking(speaking);
      setVolume(Math.min(rms * 20, 1));

      // --- Talk time ---
      totalMsRef.current += CHECK_INTERVAL;
      if (speaking) {
        speakingMsRef.current += CHECK_INTERVAL;
      }

      const percent = totalMsRef.current > 0
        ? Math.round((speakingMsRef.current / totalMsRef.current) * 100)
        : 0;
      setTalkTimePercent(percent);

      // --- Energy (pitch variation + volume variance) ---
      // Only track energy while speaking, otherwise it's just noise
      if (speaking) {
        // Find dominant frequency via peak in frequency spectrum
        analyser.getFloatFrequencyData(freqData);
        let maxVal = -Infinity;
        let maxIdx = 0;
        // Only search voice range: ~85Hz to ~500Hz
        const minBin = Math.floor(85 / (audioContext.sampleRate / analyser.fftSize));
        const maxBin = Math.ceil(500 / (audioContext.sampleRate / analyser.fftSize));
        for (let i = minBin; i < maxBin && i < freqData.length; i++) {
          if (freqData[i] > maxVal) {
            maxVal = freqData[i];
            maxIdx = i;
          }
        }
        const dominantFreq = maxIdx * (audioContext.sampleRate / analyser.fftSize);

        rmsHistoryRef.current.push(rms);
        pitchHistoryRef.current.push(dominantFreq);
      }

      // Trim to window size
      if (rmsHistoryRef.current.length > ENERGY_WINDOW_SIZE) {
        rmsHistoryRef.current = rmsHistoryRef.current.slice(-ENERGY_WINDOW_SIZE);
      }
      if (pitchHistoryRef.current.length > ENERGY_WINDOW_SIZE) {
        pitchHistoryRef.current = pitchHistoryRef.current.slice(-ENERGY_WINDOW_SIZE);
      }

      // Calculate energy from the rolling window
      const rmsHistory = rmsHistoryRef.current;
      const pitchHistory = pitchHistoryRef.current;

      if (rmsHistory.length >= 5) {
        // Volume variance (standard deviation of RMS)
        const rmsMean = rmsHistory.reduce((a, b) => a + b, 0) / rmsHistory.length;
        const rmsVariance = rmsHistory.reduce((a, v) => a + (v - rmsMean) ** 2, 0) / rmsHistory.length;
        const rmsStd = Math.sqrt(rmsVariance);
        // Normalize: std of 0.02 is quite dynamic for speech
        const volumeVariation = Math.min(rmsStd / 0.02, 1);

        // Pitch variation (standard deviation of dominant frequency)
        const pitchMean = pitchHistory.reduce((a, b) => a + b, 0) / pitchHistory.length;
        const pitchVariance = pitchHistory.reduce((a, v) => a + (v - pitchMean) ** 2, 0) / pitchHistory.length;
        const pitchStd = Math.sqrt(pitchVariance);
        // Normalize: std of 50Hz is quite varied for speech
        const pitchVariation = Math.min(pitchStd / 50, 1);

        // Vocal tone: pitch variation is the primary signal for vocal engagement
        setVocalTone((pitchVariation * 0.6 + volumeVariation * 0.4));
      } else if (!speaking) {
        // Decay toward 0 when silent
        setVocalTone(prev => Math.max(prev - 0.02, 0));
      }
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

  return { isSpeaking, talkTimePercent, volume, vocalTone, getCumulativeMs };
}
