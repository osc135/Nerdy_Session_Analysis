import { useState, useEffect, useRef, useCallback } from 'react';

const COOLDOWN_MS = 5 * 60 * 1000; // same nudge type can't fire within 5 minutes
const CHECK_INTERVAL_MS = 2000;     // check thresholds every 2 seconds

// Nudge definitions: each has a type key, a check function, and a message
const NUDGE_RULES = [
  {
    type: 'student_silence',
    message: 'Your student hasn\'t spoken in over 3 minutes. Try asking an open-ended question to re-engage them.',
    check: ({ studentSilenceMs }) => studentSilenceMs >= 180_000,
  },
  {
    type: 'low_eye_contact',
    message: 'Your student\'s eye contact has been low. They may be distracted or looking at something else.',
    check: ({ studentGaze, studentGazeDuration }) =>
      studentGaze < 40 && studentGazeDuration >= 30_000,
  },
  {
    type: 'talk_time_imbalance',
    message: 'You\'ve been doing most of the talking. Consider pausing to check for understanding.',
    check: ({ tutorTalkPercent, sessionMs }) =>
      tutorTalkPercent > 80 && sessionMs >= 300_000,
  },
  {
    type: 'energy_drop',
    message: 'Engagement energy seems to be dropping. A change of activity or short break might help.',
    check: ({ energyDrop }) => energyDrop >= 20,
  },
  {
    type: 'interruption_spike',
    message: 'There have been several interruptions recently. Try giving a bit more wait time before responding.',
    check: ({ recentInterruptions }) => recentInterruptions >= 3,
  },
];

export function useNudgeEngine({ localMetrics, remoteMetrics, connectionState, elapsed }) {
  const [nudges, setNudges] = useState([]);
  const lastFiredRef = useRef({}); // { [type]: timestamp }

  // Track student silence duration
  const studentSilenceStartRef = useRef(null);
  const studentSilenceMsRef = useRef(0);

  // Track low eye contact duration
  const lowGazeStartRef = useRef(null);
  const lowGazeDurationRef = useRef(0);

  // Track energy for drop detection
  const energyHistoryRef = useRef([]); // [{ time, value }]

  // Track interruptions (both speaking simultaneously)
  const interruptionTimesRef = useRef([]); // timestamps of detected interruptions
  const bothSpeakingRef = useRef(false);

  const formatTime = useCallback((s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    // Don't run until both peers are connected
    if (connectionState !== 'connected' || !remoteMetrics) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const studentSpeaking = remoteMetrics.isSpeaking;
      const tutorSpeaking = localMetrics.isSpeaking;
      const studentGaze = remoteMetrics.gazeScore ?? 0;
      const studentEnergy = Math.round((remoteMetrics.energy ?? 0) * 100);

      // --- Student silence tracking ---
      if (studentSpeaking) {
        studentSilenceStartRef.current = null;
        studentSilenceMsRef.current = 0;
      } else {
        if (!studentSilenceStartRef.current) {
          studentSilenceStartRef.current = now;
        }
        studentSilenceMsRef.current = now - studentSilenceStartRef.current;
      }

      // --- Low eye contact duration tracking ---
      if (studentGaze < 40) {
        if (!lowGazeStartRef.current) {
          lowGazeStartRef.current = now;
        }
        lowGazeDurationRef.current = now - lowGazeStartRef.current;
      } else {
        lowGazeStartRef.current = null;
        lowGazeDurationRef.current = 0;
      }

      // --- Energy drop tracking (over 5 minute window) ---
      energyHistoryRef.current.push({ time: now, value: studentEnergy });
      energyHistoryRef.current = energyHistoryRef.current.filter(
        e => now - e.time <= 300_000
      );
      let energyDrop = 0;
      if (energyHistoryRef.current.length >= 2) {
        const oldest = energyHistoryRef.current[0].value;
        const newest = energyHistoryRef.current[energyHistoryRef.current.length - 1].value;
        energyDrop = Math.max(oldest - newest, 0);
      }

      // --- Interruption detection ---
      const bothSpeaking = tutorSpeaking && studentSpeaking;
      if (bothSpeaking && !bothSpeakingRef.current) {
        // New interruption event (rising edge)
        interruptionTimesRef.current.push(now);
      }
      bothSpeakingRef.current = bothSpeaking;
      // Count interruptions in last 2 minutes
      interruptionTimesRef.current = interruptionTimesRef.current.filter(
        t => now - t <= 120_000
      );
      const recentInterruptions = interruptionTimesRef.current.length;

      // --- Compute talk time balance ---
      const localAudio = localMetrics.getCumulativeMs();
      const remoteSpeakingMs = remoteMetrics.speakingMs || 0;
      const totalSpeakingMs = localAudio.speakingMs + remoteSpeakingMs;
      const tutorTalkPercent = totalSpeakingMs > 0
        ? Math.round((localAudio.speakingMs / totalSpeakingMs) * 100)
        : 0;

      const sessionMs = elapsed * 1000;

      // --- Check all rules ---
      const context = {
        studentSilenceMs: studentSilenceMsRef.current,
        studentGaze,
        studentGazeDuration: lowGazeDurationRef.current,
        tutorTalkPercent,
        sessionMs,
        energyDrop,
        recentInterruptions,
      };

      for (const rule of NUDGE_RULES) {
        if (rule.check(context)) {
          const lastFired = lastFiredRef.current[rule.type] || 0;
          if (now - lastFired >= COOLDOWN_MS) {
            lastFiredRef.current[rule.type] = now;
            setNudges(prev => [...prev, {
              message: rule.message,
              timestamp: formatTime(elapsed),
              type: rule.type,
            }]);
          }
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [connectionState, remoteMetrics, localMetrics, elapsed, formatTime]);

  return nudges;
}
