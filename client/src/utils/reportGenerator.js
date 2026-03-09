// Builds the post-session report data structure from metric history

export function generateReport(sessionData) {
  const { tutor, student, sessionId } = sessionData;

  const tutorSnapshots = tutor?.snapshots || [];
  const studentSnapshots = student?.snapshots || [];
  const duration = Math.max(tutor?.duration || 0, student?.duration || 0);

  const talkTime = computeTalkTimeSummary(tutorSnapshots, studentSnapshots);
  const eyeContact = computeEyeContactSummary(tutorSnapshots, studentSnapshots);
  const interruptions = computeInterruptionSummary(tutorSnapshots);
  const energy = computeEnergySummary(tutorSnapshots, studentSnapshots);
  const engagementScore = computeEngagementScore({ talkTime, eyeContact, interruptions, energy });

  return {
    sessionId,
    duration,
    durationMinutes: Math.round(duration / 60000),
    summary: { talkTime, eyeContact, interruptions, energy, engagementScore },
    keyMoments: findKeyMoments(tutorSnapshots, studentSnapshots),
    nudgeLog: tutor?.nudges || [],
    recommendations: generateRecommendations({ talkTime, eyeContact, interruptions, energy }, tutor?.nudges || []),
  };
}

// ─── Tier 1: Simple aggregations ────────────────────────────────────

function computeTalkTimeSummary(tutorSnaps) {
  if (tutorSnaps.length === 0) return { tutor: 0, student: 0 };

  const last = tutorSnaps[tutorSnaps.length - 1];
  const tutorMs = last.tutor?.speakingMs || 0;
  const studentMs = last.student?.speakingMs || 0;
  const total = tutorMs + studentMs;

  if (total === 0) return { tutor: 0, student: 0 };

  return {
    tutor: Math.round((tutorMs / total) * 100),
    student: Math.round((studentMs / total) * 100),
  };
}

function computeEyeContactSummary(tutorSnaps) {
  if (tutorSnaps.length === 0) return { tutor: 0, student: 0 };

  let tutorSum = 0;
  let studentSum = 0;

  for (const s of tutorSnaps) {
    tutorSum += s.tutor?.gazeScore || 0;
    studentSum += s.student?.gazeScore || 0;
  }

  return {
    tutor: Math.round(tutorSum / tutorSnaps.length),
    student: Math.round(studentSum / tutorSnaps.length),
  };
}

function computeEnergySummary(tutorSnaps) {
  if (tutorSnaps.length === 0) return { tutor: 0, student: 0 };

  let tutorSum = 0;
  let studentSum = 0;

  for (const s of tutorSnaps) {
    const tEnergy = s.tutor?.energy ?? 0;
    const sEnergy = s.student?.energy ?? 0;
    // Normalize: if values are 0-1, scale to 0-100; if already 0-100, use as-is
    tutorSum += tEnergy <= 1 ? tEnergy * 100 : tEnergy;
    studentSum += sEnergy <= 1 ? sEnergy * 100 : sEnergy;
  }

  return {
    tutor: Math.round(tutorSum / tutorSnaps.length),
    student: Math.round(studentSum / tutorSnaps.length),
  };
}

// ─── Tier 2: Stateful scanning ──────────────────────────────────────

function computeInterruptionSummary(tutorSnaps) {
  if (tutorSnaps.length === 0) return { total: 0, perMinute: 0 };

  let total = 0;
  let wasBothSpeaking = false;

  for (const s of tutorSnaps) {
    const bothSpeaking = !!(s.tutor?.isSpeaking && s.student?.isSpeaking);
    if (bothSpeaking && !wasBothSpeaking) {
      total++;
    }
    wasBothSpeaking = bothSpeaking;
  }

  const first = tutorSnaps[0];
  const last = tutorSnaps[tutorSnaps.length - 1];
  const durationMin = Math.max((last.elapsed - first.elapsed) / 60_000, 1 / 60);
  const perMinute = total > 0 ? Math.round((total / durationMin) * 10) / 10 : 0;

  return { total, perMinute };
}

function findKeyMoments(tutorSnaps) {
  const moments = [];
  if (tutorSnaps.length === 0) return moments;

  // Detect sustained low student gaze (<30 for 30s+)
  let lowGazeStart = null;
  for (const s of tutorSnaps) {
    const gaze = s.student?.gazeScore ?? 100;
    if (gaze < 30) {
      if (lowGazeStart === null) lowGazeStart = s.elapsed;
    } else {
      if (lowGazeStart !== null && s.elapsed - lowGazeStart >= 30_000) {
        moments.push({
          type: 'attention_drop',
          elapsed: lowGazeStart,
          description: `Student attention dropped for ${Math.round((s.elapsed - lowGazeStart) / 1000)}s`,
        });
      }
      lowGazeStart = null;
    }
  }
  // Check if low gaze extends to end of session
  if (lowGazeStart !== null) {
    const last = tutorSnaps[tutorSnaps.length - 1];
    if (last.elapsed - lowGazeStart >= 30_000) {
      moments.push({
        type: 'attention_drop',
        elapsed: lowGazeStart,
        description: `Student attention dropped for ${Math.round((last.elapsed - lowGazeStart) / 1000)}s`,
      });
    }
  }

  // Detect long mutual silences (60s+)
  let silenceStart = null;
  for (const s of tutorSnaps) {
    const bothSilent = !s.tutor?.isSpeaking && !s.student?.isSpeaking;
    if (bothSilent) {
      if (silenceStart === null) silenceStart = s.elapsed;
    } else {
      if (silenceStart !== null && s.elapsed - silenceStart >= 60_000) {
        moments.push({
          type: 'long_silence',
          elapsed: silenceStart,
          description: `Neither party spoke for ${Math.round((s.elapsed - silenceStart) / 1000)}s`,
        });
      }
      silenceStart = null;
    }
  }
  if (silenceStart !== null) {
    const last = tutorSnaps[tutorSnaps.length - 1];
    if (last.elapsed - silenceStart >= 60_000) {
      moments.push({
        type: 'long_silence',
        elapsed: silenceStart,
        description: `Neither party spoke for ${Math.round((last.elapsed - silenceStart) / 1000)}s`,
      });
    }
  }

  return moments.sort((a, b) => a.elapsed - b.elapsed);
}

// ─── Tier 3: Composite / derived ────────────────────────────────────

function computeEngagementScore({ talkTime, eyeContact, interruptions, energy }) {
  if (eyeContact.student === 0 && energy.student === 0) return 0;

  // Eye contact: student gaze as percentage (weight 0.3)
  const gazeScore = eyeContact.student / 100;

  // Talk balance: perfect at 50/50, worst at 100/0 (weight 0.25)
  const balanceScore = 1 - Math.abs(talkTime.tutor - 50) / 50;

  // Energy: student energy as percentage (weight 0.25)
  const energyScore = energy.student / 100;

  // Interaction quality: penalize high interruption rate (weight 0.2)
  const interactionScore = Math.max(1 - interruptions.perMinute / 3, 0);

  const weighted =
    gazeScore * 0.3 +
    balanceScore * 0.25 +
    energyScore * 0.25 +
    interactionScore * 0.2;

  return Math.round(weighted * 100);
}

function generateRecommendations(summaries, nudges) {
  const recs = [];
  const { talkTime, eyeContact, interruptions, energy } = summaries;

  if (talkTime.tutor > 70) {
    recs.push({
      text: 'You did most of the talking this session. Try asking more open-ended questions to involve the student.',
      priority: 'high',
    });
  }

  if (eyeContact.student < 50) {
    recs.push({
      text: 'Student eye contact was low. Consider using screen sharing or visual aids to keep their focus.',
      priority: 'high',
    });
  }

  if (nudges.length > 5) {
    recs.push({
      text: 'Several coaching suggestions were triggered. Review the nudge log and practice the recommended techniques.',
      priority: 'medium',
    });
  }

  if (interruptions.perMinute > 1) {
    recs.push({
      text: 'There were frequent interruptions. Try giving more wait time after asking questions before responding.',
      priority: 'medium',
    });
  }

  if (energy.student < 30) {
    recs.push({
      text: 'Student energy was low throughout. Consider shorter sessions or more interactive activities.',
      priority: 'medium',
    });
  }

  return recs;
}
