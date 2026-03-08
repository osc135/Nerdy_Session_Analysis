// useAudioAnalysis.js — Voice activity detection, speaking time, energy, interruptions
// Uses Web Audio API to analyze local microphone input

import { useState, useEffect, useRef } from 'react';

export function useAudioAnalysis(stream) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingTime, setSpeakingTime] = useState(0);
  const [audioEnergy, setAudioEnergy] = useState(0);

  // TODO: Create AudioContext + AnalyserNode
  // TODO: Voice activity detection via RMS threshold
  // TODO: Track cumulative speaking time
  // TODO: Calculate audio energy from volume variance

  return { isSpeaking, speakingTime, audioEnergy };
}
