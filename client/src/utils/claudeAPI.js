// Claude API wrapper — proxied through Node.js server to protect API key

export async function generateNudge(triggerType, metrics) {
  const prompt = buildPrompt(triggerType, metrics);

  const res = await fetch('/api/nudge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    console.error('Nudge API error:', res.status);
    return getFallbackNudge(triggerType);
  }

  const data = await res.json();
  return data.nudge;
}

function buildPrompt(triggerType, metrics) {
  const context = `Current session metrics:
- Tutor eye contact: ${(metrics.tutor?.eyeContact * 100).toFixed(0)}%
- Student eye contact: ${(metrics.student?.eyeContact * 100).toFixed(0)}%
- Tutor talk time: ${(metrics.tutor?.talkTimePercent * 100).toFixed(0)}%
- Student talk time: ${(metrics.student?.talkTimePercent * 100).toFixed(0)}%
- Tutor energy: ${metrics.tutor?.energy?.toFixed(0)}/100
- Student energy: ${metrics.student?.energy?.toFixed(0)}/100
- Interruptions in last 2 min: ${metrics.session?.recentInterruptions ?? 0}
- Student silence duration: ${metrics.session?.studentSilenceDuration ?? 0}s`;

  const triggers = {
    studentSilence: 'Student has been silent for an extended period.',
    tutorEyeContact: 'Tutor eye contact has been low.',
    tutorTalkTime: 'Tutor has been doing most of the talking.',
    energyDrop: 'Engagement energy has dropped significantly.',
    interruptionSpike: 'There have been frequent interruptions.',
    mutualDisengagement: 'Both participants show signs of disengagement.',
  };

  return `${triggers[triggerType] || 'General engagement check needed.'}\n\n${context}\n\nGenerate a coaching nudge for the tutor.`;
}

// Fallback nudges if Claude API is unavailable
function getFallbackNudge(triggerType) {
  const fallbacks = {
    studentSilence: "Your student hasn't spoken in a while. Try asking an open-ended question to re-engage them.",
    tutorEyeContact: "Try looking at the camera more to create better eye contact with your student.",
    tutorTalkTime: "You've been doing most of the talking. Consider pausing to check for understanding.",
    energyDrop: "Engagement seems to be dropping. A change of pace or quick activity might help.",
    interruptionSpike: "There have been several interruptions. Try giving a bit more wait time before responding.",
    mutualDisengagement: "Both of you seem less engaged. Consider switching to a more interactive activity.",
  };
  return fallbacks[triggerType] || "Check in with your student to see how they're doing.";
}
