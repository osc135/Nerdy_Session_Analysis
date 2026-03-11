// Builds the post-session report data structure from metric history

// Ideal talk time ranges per session type (tutor %)
export const SESSION_TYPE_BENCHMARKS = {
  lecture:  { min: 70, max: 80, label: 'Lecture / Explanation' },
  practice: { min: 30, max: 50, label: 'Practice / Review' },
  socratic: { min: 40, max: 60, label: 'Socratic Discussion' },
};

export function generateReport(sessionData) {
  const { tutor, student, sessionId } = sessionData;
  const sessionType = tutor?.sessionType || 'lecture';

  const tutorSnapshots = tutor?.snapshots || [];
  const studentSnapshots = student?.snapshots || [];
  const duration = Math.max(tutor?.duration || 0, student?.duration || 0);

  // Detect if student data exists — check if any snapshot has student gaze/speaking data
  const hasStudent = tutorSnapshots.some(s =>
    s.student?.gazeScore !== undefined || s.student?.isSpeaking !== undefined
  ) || studentSnapshots.length > 0;

  const talkTime = computeTalkTimeSummary(tutorSnapshots, studentSnapshots);
  const eyeContact = computeEyeContactSummary(tutorSnapshots, studentSnapshots);
  const interruptions = computeInterruptionSummary(tutorSnapshots);
  const energy = computeEnergySummary(tutorSnapshots, studentSnapshots);
  const mutualAttention = computeMutualAttention(tutorSnapshots);
  const attentionDrift = computeAttentionDriftSummary(tutorSnapshots);
  const engagementScore = computeEngagementScore({ talkTime, eyeContact, interruptions, energy, mutualAttention, hasStudent, sessionType });

  return {
    sessionId,
    sessionType,
    duration,
    durationMinutes: Math.round(duration / 60000),
    hasStudent,
    summary: { talkTime, eyeContact, interruptions, energy, mutualAttention, attentionDrift, engagementScore },
    keyMoments: findKeyMoments(tutorSnapshots, studentSnapshots),
    nudgeLog: tutor?.nudges || [],
    recommendations: generateRecommendations({ talkTime, eyeContact, interruptions, energy, mutualAttention, attentionDrift, hasStudent, sessionType }, tutor?.nudges || []),
    snapshots: tutorSnapshots,
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

function computeMutualAttention(tutorSnaps) {
  if (tutorSnaps.length === 0) return { percent: 0 };

  let mutualFrames = 0;

  for (const s of tutorSnaps) {
    const tutorGaze = s.tutor?.gazeScore ?? 0;
    const studentGaze = s.student?.gazeScore ?? 0;
    if (tutorGaze >= 50 && studentGaze >= 50) {
      mutualFrames++;
    }
  }

  return {
    percent: Math.round((mutualFrames / tutorSnaps.length) * 100),
  };
}

function computeAttentionDriftSummary(tutorSnaps) {
  if (tutorSnaps.length === 0) return { average: 0, peakDrift: 0, driftPercent: 0 };

  let sum = 0;
  let peak = 0;
  let count = 0;
  let driftFrames = 0;

  for (const s of tutorSnaps) {
    const drift = s.tutor?.attentionDrift;
    if (drift == null) continue;
    count++;
    sum += drift;
    if (drift > peak) peak = drift;
    if (drift >= 65) driftFrames++;
  }

  if (count === 0) return { average: 0, peakDrift: 0, driftPercent: 0 };

  return {
    average: Math.round(sum / count),
    peakDrift: peak,
    driftPercent: Math.round((driftFrames / count) * 100),
  };
}

// ─── Tier 2: Stateful scanning ──────────────────────────────────────

function computeInterruptionSummary(tutorSnaps) {
  if (tutorSnaps.length === 0) return { total: 0, perMinute: 0, tutorInitiated: 0, studentInitiated: 0 };

  let total = 0;
  let tutorInitiated = 0;
  let studentInitiated = 0;
  let wasBothSpeaking = false;
  let prevTutorSpeaking = false;
  let prevStudentSpeaking = false;

  for (const s of tutorSnaps) {
    const tutorSpeaking = !!s.tutor?.isSpeaking;
    const studentSpeaking = !!s.student?.isSpeaking;
    const bothSpeaking = tutorSpeaking && studentSpeaking;

    if (bothSpeaking && !wasBothSpeaking) {
      total++;
      // Who started speaking into the other's turn?
      if (prevStudentSpeaking && !prevTutorSpeaking) {
        tutorInitiated++;
      } else if (prevTutorSpeaking && !prevStudentSpeaking) {
        studentInitiated++;
      }
    }

    wasBothSpeaking = bothSpeaking;
    prevTutorSpeaking = tutorSpeaking;
    prevStudentSpeaking = studentSpeaking;
  }

  const first = tutorSnaps[0];
  const last = tutorSnaps[tutorSnaps.length - 1];
  const durationMin = Math.max((last.elapsed - first.elapsed) / 60_000, 1 / 60);
  const perMinute = total > 0 ? Math.round((total / durationMin) * 10) / 10 : 0;

  return { total, perMinute, tutorInitiated, studentInitiated };
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

  // Detect sustained low tutor gaze (<30 for 30s+)
  let tutorLowGazeStart = null;
  for (const s of tutorSnaps) {
    const gaze = s.tutor?.gazeScore ?? 100;
    if (gaze < 30) {
      if (tutorLowGazeStart === null) tutorLowGazeStart = s.elapsed;
    } else {
      if (tutorLowGazeStart !== null && s.elapsed - tutorLowGazeStart >= 30_000) {
        moments.push({
          type: 'tutor_attention_drop',
          elapsed: tutorLowGazeStart,
          description: `Tutor looked away for ${Math.round((s.elapsed - tutorLowGazeStart) / 1000)}s`,
        });
      }
      tutorLowGazeStart = null;
    }
  }
  if (tutorLowGazeStart !== null) {
    const last = tutorSnaps[tutorSnaps.length - 1];
    if (last.elapsed - tutorLowGazeStart >= 30_000) {
      moments.push({
        type: 'tutor_attention_drop',
        elapsed: tutorLowGazeStart,
        description: `Tutor looked away for ${Math.round((last.elapsed - tutorLowGazeStart) / 1000)}s`,
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

  // Detect sustained attention drift >= 65 for 30s+
  let driftStart = null;
  for (const s of tutorSnaps) {
    const drift = s.tutor?.attentionDrift ?? 0;
    if (drift >= 65) {
      if (driftStart === null) driftStart = s.elapsed;
    } else {
      if (driftStart !== null && s.elapsed - driftStart >= 30_000) {
        moments.push({
          type: 'attention_drift',
          elapsed: driftStart,
          description: `Student showed signs of disengagement for ${Math.round((s.elapsed - driftStart) / 1000)}s`,
        });
      }
      driftStart = null;
    }
  }
  if (driftStart !== null) {
    const last = tutorSnaps[tutorSnaps.length - 1];
    if (last.elapsed - driftStart >= 30_000) {
      moments.push({
        type: 'attention_drift',
        elapsed: driftStart,
        description: `Student showed signs of disengagement for ${Math.round((last.elapsed - driftStart) / 1000)}s`,
      });
    }
  }

  return moments.sort((a, b) => a.elapsed - b.elapsed);
}

// ─── Tier 3: Composite / derived ────────────────────────────────────

function computeEngagementScore({ talkTime, eyeContact, interruptions, energy, mutualAttention, hasStudent, sessionType = 'lecture' }) {
  if (!hasStudent) {
    // Tutor-only session: score based on tutor metrics only
    const tutorGazeScore = eyeContact.tutor / 100;
    const tutorEnergyScore = energy.tutor / 100;
    if (tutorGazeScore === 0 && tutorEnergyScore === 0) return 0;
    const weighted = tutorGazeScore * 0.5 + tutorEnergyScore * 0.5;
    return Math.round(weighted * 100);
  }

  if (eyeContact.student === 0 && energy.student === 0) return 0;

  // Student eye contact (weight 0.2)
  const studentGazeScore = eyeContact.student / 100;

  // Tutor eye contact (weight 0.1)
  const tutorGazeScore = eyeContact.tutor / 100;

  // Mutual attention bonus (weight 0.1)
  const mutualScore = (mutualAttention?.percent || 0) / 100;

  // Talk balance: score based on how close to ideal range for session type (weight 0.2)
  const bench = SESSION_TYPE_BENCHMARKS[sessionType] || SESSION_TYPE_BENCHMARKS.lecture;
  const idealCenter = (bench.min + bench.max) / 2;
  const balanceScore = Math.max(0, 1 - Math.abs(talkTime.tutor - idealCenter) / 50);

  // Energy: average of both (weight 0.2)
  const energyScore = ((energy.student + energy.tutor) / 2) / 100;

  // Interaction quality: penalize high interruption rate (weight 0.2)
  const interactionScore = Math.max(1 - interruptions.perMinute / 3, 0);

  const weighted =
    studentGazeScore * 0.2 +
    tutorGazeScore * 0.1 +
    mutualScore * 0.1 +
    balanceScore * 0.2 +
    energyScore * 0.2 +
    interactionScore * 0.2;

  return Math.round(weighted * 100);
}

function generateRecommendations(summaries, nudges) {
  const recs = [];
  const { talkTime, eyeContact, interruptions, energy, mutualAttention, attentionDrift, hasStudent, sessionType = 'lecture' } = summaries;
  const bench = SESSION_TYPE_BENCHMARKS[sessionType] || SESSION_TYPE_BENCHMARKS.lecture;

  if (eyeContact.tutor < 50) {
    recs.push({
      text: 'Your eye contact was low. Looking at the camera more helps the student feel connected and engaged.',
      priority: 'high',
    });
  }

  if (energy.tutor < 30) {
    recs.push({
      text: 'Your energy was low this session. Varying your tone and pace can help keep both you and the student engaged.',
      priority: 'medium',
    });
  }

  if (hasStudent) {
    if (talkTime.tutor > bench.max) {
      recs.push({
        text: `Your talk time (${talkTime.tutor}%) was above the ${bench.min}-${bench.max}% target for a ${bench.label} session. Try giving the student more space to participate.`,
        priority: 'high',
      });
    } else if (talkTime.tutor < bench.min) {
      recs.push({
        text: `Your talk time (${talkTime.tutor}%) was below the ${bench.min}-${bench.max}% target for a ${bench.label} session. The student may need more guidance or explanation.`,
        priority: 'medium',
      });
    }

    if (eyeContact.student < 50) {
      recs.push({
        text: 'Student eye contact was low. Consider using screen sharing or visual aids to keep their focus.',
        priority: 'high',
      });
    }

    if ((mutualAttention?.percent || 0) < 30) {
      recs.push({
        text: 'Mutual attention was low — you and the student rarely looked at each other at the same time. Try checking in more frequently.',
        priority: 'medium',
      });
    }

    if (interruptions.tutorInitiated > interruptions.studentInitiated && interruptions.tutorInitiated >= 3) {
      recs.push({
        text: 'You interrupted the student more often than they interrupted you. Give more wait time after they start speaking.',
        priority: 'high',
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

    if (attentionDrift && attentionDrift.driftPercent > 30) {
      recs.push({
        text: `The student showed signs of disengagement ${attentionDrift.driftPercent}% of the time. Try incorporating more interactive activities, asking direct questions, or switching formats when you notice drift.`,
        priority: 'high',
      });
    }
  }

  if (nudges.length > 5) {
    recs.push({
      text: 'Several coaching suggestions were triggered. Review the nudge log and practice the recommended techniques.',
      priority: 'medium',
    });
  }

  return recs;
}
