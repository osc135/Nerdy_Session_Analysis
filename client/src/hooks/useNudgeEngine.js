import { useState, useEffect, useRef, useCallback } from 'react';

const COOLDOWN_MS = 2 * 60 * 1000; // same nudge type can't fire within 2 minutes
const CHECK_INTERVAL_MS = 2000;     // check thresholds every 2 seconds

// Talk time thresholds per session type — nudge fires when tutor exceeds this
const TALK_TIME_THRESHOLDS = {
  lecture:  { max: 85, message: 'Even in a lecture, pausing to check for understanding helps. Try asking a quick question.' },
  practice: { max: 55, message: 'In a practice session, the student should be doing most of the work. Try stepping back and letting them lead.' },
  socratic: { max: 65, message: 'A Socratic discussion works best as a dialogue. Try asking a thought-provoking question instead of explaining.' },
};

// Nudge definitions: each has a type key, a check function, and a message
const NUDGE_RULES = [
  {
    type: 'student_muted',
    requiresStudent: true,
    message: 'Your student has been muted for a while. They may have forgotten to unmute, or might not feel comfortable speaking up.',
    check: ({ studentMutedMs }) => studentMutedMs >= 120_000,
  },
  {
    type: 'student_silence',
    requiresStudent: true,
    message: 'Your student hasn\'t spoken in over 3 minutes. Try asking an open-ended question to re-engage them.',
    check: ({ studentSilenceMs }) => studentSilenceMs >= 180_000,
  },
  {
    type: 'low_eye_contact',
    requiresStudent: true,
    message: 'Your student\'s eye contact has been low. They may be distracted or looking at something else.',
    check: ({ studentGaze, studentGazeDuration }) =>
      studentGaze < 40 && studentGazeDuration >= 30_000,
  },
  {
    type: 'tutor_low_eye_contact',
    requiresStudent: false,
    message: 'Try making more eye contact with the camera. Looking at the camera helps your student feel connected.',
    check: ({ tutorGaze, tutorGazeDuration }) =>
      tutorGaze < 40 && tutorGazeDuration >= 30_000,
  },
  {
    type: 'talk_time_imbalance',
    requiresStudent: true,
    message: null, // set dynamically based on session type
    check: ({ tutorTalkPercent, sessionMs, sessionType }) => {
      const threshold = TALK_TIME_THRESHOLDS[sessionType] || TALK_TIME_THRESHOLDS.lecture;
      return tutorTalkPercent > threshold.max && sessionMs >= 300_000;
    },
    getMessage: ({ sessionType }) => {
      const threshold = TALK_TIME_THRESHOLDS[sessionType] || TALK_TIME_THRESHOLDS.lecture;
      return threshold.message;
    },
  },
  {
    type: 'energy_drop',
    requiresStudent: true,
    message: 'Engagement energy seems to be dropping. A change of activity or short break might help.',
    check: ({ energyDrop }) => energyDrop >= 20,
  },
  {
    type: 'interruption_spike',
    requiresStudent: true,
    message: 'There have been several interruptions recently. Try giving a bit more wait time before responding.',
    check: ({ recentInterruptions }) => recentInterruptions >= 3,
  },
  {
    type: 'tutor_interrupting',
    requiresStudent: true,
    message: 'You\'ve interrupted the student a few times recently. Try giving more wait time after they speak.',
    check: ({ recentTutorInterruptions }) => recentTutorInterruptions >= 3,
  },
  {
    type: 'mutual_disengagement',
    requiresStudent: true,
    message: 'Your student shows signs of disengagement \u2014 low eye contact, low energy, and not speaking. Try switching to an interactive activity or asking a direct question.',
    check: ({ driftDuration }) => driftDuration >= 20_000,
  },
];

export function useNudgeEngine({ localMetrics, remoteMetrics, connectionState, elapsed, sessionType = 'lecture' }) {
  const [nudges, setNudges] = useState([]);
  const lastFiredRef = useRef({}); // { [type]: timestamp }

  // Store latest values in refs so the interval always reads current data
  const remoteMetricsRef = useRef(remoteMetrics);
  const localMetricsRef = useRef(localMetrics);
  const elapsedRef = useRef(elapsed);

  useEffect(() => { remoteMetricsRef.current = remoteMetrics; }, [remoteMetrics]);
  useEffect(() => { localMetricsRef.current = localMetrics; }, [localMetrics]);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // Track student silence duration (mic on but not talking)
  const studentSilenceStartRef = useRef(null);
  const studentSilenceMsRef = useRef(0);

  // Track student muted duration
  const studentMutedStartRef = useRef(null);
  const studentMutedMsRef = useRef(0);

  // Track low eye contact duration (student)
  const lowGazeStartRef = useRef(null);
  const lowGazeDurationRef = useRef(0);

  // Track low eye contact duration (tutor)
  const tutorLowGazeStartRef = useRef(null);
  const tutorLowGazeDurationRef = useRef(0);

  // Track energy for drop detection
  const energyHistoryRef = useRef([]); // [{ time, value }]

  // Track combined disengagement (low gaze + low energy + silent)
  const driftStartRef = useRef(null);
  const driftDurationRef = useRef(0);

  // Track interruptions (both speaking simultaneously)
  const interruptionTimesRef = useRef([]); // timestamps of detected interruptions
  const tutorInterruptionTimesRef = useRef([]); // tutor interrupting student
  const bothSpeakingRef = useRef(false);
  const prevSpeakingRef = useRef({ tutor: false, student: false });

  // Track whether we've ever received student data
  const hasStudentRef = useRef(false);

  const formatTime = useCallback((s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    // Don't start until both peers are connected
    if (connectionState !== 'connected') return;

    const interval = setInterval(() => {
      const remote = remoteMetricsRef.current;
      const local = localMetricsRef.current;
      if (remote) hasStudentRef.current = true;

      const now = Date.now();
      const studentSpeaking = remote?.isSpeaking ?? false;
      const studentMuted = remote?.muted ?? false;
      const tutorSpeaking = local.isSpeaking;
      const studentGaze = remote?.gazeScore ?? 0;
      const tutorGaze = local.gazeScore ?? 0;
      const studentEnergy = Math.round((remote?.energy ?? 0) * 100);

      // --- Student muted tracking ---
      if (studentMuted) {
        if (!studentMutedStartRef.current) {
          studentMutedStartRef.current = now;
        }
        studentMutedMsRef.current = now - studentMutedStartRef.current;
        // Reset silence timer while muted (silence = mic on but not talking)
        studentSilenceStartRef.current = null;
        studentSilenceMsRef.current = 0;
      } else {
        studentMutedStartRef.current = null;
        studentMutedMsRef.current = 0;

        // --- Student silence tracking (only when not muted) ---
        if (studentSpeaking) {
          studentSilenceStartRef.current = null;
          studentSilenceMsRef.current = 0;
        } else {
          if (!studentSilenceStartRef.current) {
            studentSilenceStartRef.current = now;
          }
          studentSilenceMsRef.current = now - studentSilenceStartRef.current;
        }
      }

      // --- Low eye contact duration tracking (student) ---
      if (studentGaze < 40) {
        if (!lowGazeStartRef.current) {
          lowGazeStartRef.current = now;
        }
        lowGazeDurationRef.current = now - lowGazeStartRef.current;
      } else {
        lowGazeStartRef.current = null;
        lowGazeDurationRef.current = 0;
      }

      // --- Low eye contact duration tracking (tutor) ---
      if (tutorGaze < 40) {
        if (!tutorLowGazeStartRef.current) {
          tutorLowGazeStartRef.current = now;
        }
        tutorLowGazeDurationRef.current = now - tutorLowGazeStartRef.current;
      } else {
        tutorLowGazeStartRef.current = null;
        tutorLowGazeDurationRef.current = 0;
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

      // --- Combined disengagement (drift) tracking ---
      if (studentGaze < 40 && studentEnergy < 30 && !studentSpeaking) {
        if (!driftStartRef.current) {
          driftStartRef.current = now;
        }
        driftDurationRef.current = now - driftStartRef.current;
      } else {
        driftStartRef.current = null;
        driftDurationRef.current = 0;
      }

      // --- Interruption detection with direction ---
      const bothSpeaking = tutorSpeaking && studentSpeaking;
      if (bothSpeaking && !bothSpeakingRef.current) {
        interruptionTimesRef.current.push(now);
        // Determine who interrupted: if student was already speaking and tutor just started
        const prev = prevSpeakingRef.current;
        if (prev.student && !prev.tutor) {
          tutorInterruptionTimesRef.current.push(now);
        }
      }
      bothSpeakingRef.current = bothSpeaking;
      prevSpeakingRef.current = { tutor: tutorSpeaking, student: studentSpeaking };
      interruptionTimesRef.current = interruptionTimesRef.current.filter(
        t => now - t <= 120_000
      );
      tutorInterruptionTimesRef.current = tutorInterruptionTimesRef.current.filter(
        t => now - t <= 120_000
      );
      const recentInterruptions = interruptionTimesRef.current.length;
      const recentTutorInterruptions = tutorInterruptionTimesRef.current.length;

      // --- Compute talk time balance ---
      const localAudio = local.getCumulativeMs();
      const remoteSpeakingMs = remote?.speakingMs || 0;
      const totalSpeakingMs = localAudio.speakingMs + remoteSpeakingMs;
      const tutorTalkPercent = totalSpeakingMs > 0
        ? Math.round((localAudio.speakingMs / totalSpeakingMs) * 100)
        : 0;

      const sessionMs = elapsedRef.current * 1000;

      // --- Check all rules ---
      const context = {
        studentMutedMs: studentMutedMsRef.current,
        studentSilenceMs: studentSilenceMsRef.current,
        studentGaze,
        studentGazeDuration: lowGazeDurationRef.current,
        tutorGaze,
        tutorGazeDuration: tutorLowGazeDurationRef.current,
        tutorTalkPercent,
        sessionMs,
        energyDrop,
        recentInterruptions,
        recentTutorInterruptions,
        driftDuration: driftDurationRef.current,
        sessionType,
      };

      for (const rule of NUDGE_RULES) {
        if (rule.requiresStudent && !hasStudentRef.current) continue;
        if (rule.check(context)) {
          const lastFired = lastFiredRef.current[rule.type] || 0;
          if (now - lastFired >= COOLDOWN_MS) {
            lastFiredRef.current[rule.type] = now;
            const message = rule.getMessage ? rule.getMessage(context) : rule.message;
            setNudges(prev => [...prev, {
              message,
              timestamp: formatTime(elapsedRef.current),
              type: rule.type,
            }]);
          }
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [connectionState, formatTime]);

  return nudges;
}
