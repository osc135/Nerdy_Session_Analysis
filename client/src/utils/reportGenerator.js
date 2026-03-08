// Builds the post-session report data structure from metric history

export function generateReport(sessionData) {
  const { tutor, student, sessionId } = sessionData;

  const tutorSnapshots = tutor?.snapshots || [];
  const studentSnapshots = student?.snapshots || [];
  const duration = Math.max(tutor?.duration || 0, student?.duration || 0);

  return {
    sessionId,
    duration,
    durationMinutes: Math.round(duration / 60000),
    summary: {
      talkTime: computeTalkTimeSummary(tutorSnapshots, studentSnapshots),
      eyeContact: computeEyeContactSummary(tutorSnapshots, studentSnapshots),
      interruptions: computeInterruptionSummary(tutorSnapshots),
      energy: computeEnergySummary(tutorSnapshots, studentSnapshots),
      engagementScore: computeEngagementScore(tutorSnapshots, studentSnapshots),
    },
    keyMoments: findKeyMoments(tutorSnapshots, studentSnapshots),
    nudgeLog: tutor?.nudges || [],
    recommendations: generateRecommendations(tutorSnapshots, studentSnapshots, tutor?.nudges || []),
  };
}

function computeTalkTimeSummary(tutorSnaps, studentSnaps) {
  // TODO: Aggregate talk time percentages
  return { tutor: 0, student: 0 };
}

function computeEyeContactSummary(tutorSnaps, studentSnaps) {
  // TODO: Average eye contact scores
  return { tutor: 0, student: 0 };
}

function computeInterruptionSummary(tutorSnaps) {
  // TODO: Count and rate
  return { total: 0, perMinute: 0 };
}

function computeEnergySummary(tutorSnaps, studentSnaps) {
  // TODO: Average energy levels
  return { tutor: 0, student: 0 };
}

function computeEngagementScore(tutorSnaps, studentSnaps) {
  // TODO: Weighted composite
  return 0;
}

function findKeyMoments(tutorSnaps, studentSnaps) {
  // TODO: Find attention drops, engagement peaks
  return [];
}

function generateRecommendations(tutorSnaps, studentSnaps, nudges) {
  // TODO: Based on session patterns
  return [];
}
