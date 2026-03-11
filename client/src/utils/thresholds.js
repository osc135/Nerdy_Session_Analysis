// Configurable metric thresholds for coaching nudges
// Sensitivity levels: low (fewer nudges), medium (default), high (more proactive)

export const THRESHOLDS = {
  studentSilence: {
    low: 300_000,
    medium: 180_000,
    high: 120_000,
  },
  studentMuted: {
    low: 180_000,
    medium: 120_000,
    high: 60_000,
  },
  studentGaze: {
    low: 30,
    medium: 40,
    high: 50,
  },
  studentGazeDuration: {
    low: 45_000,
    medium: 30_000,
    high: 20_000,
  },
  tutorGaze: {
    low: 30,
    medium: 40,
    high: 50,
  },
  tutorGazeDuration: {
    low: 45_000,
    medium: 30_000,
    high: 20_000,
  },
  energyDrop: {
    low: 30,
    medium: 20,
    high: 15,
  },
  interruptionSpike: {
    low: 5,
    medium: 3,
    high: 2,
  },
  tutorInterruptions: {
    low: 5,
    medium: 3,
    high: 2,
  },
  driftDuration: {
    low: 30_000,
    medium: 20_000,
    high: 12_000,
  },
  driftGaze: {
    low: 30,
    medium: 40,
    high: 50,
  },
  driftEnergy: {
    low: 20,
    medium: 30,
    high: 40,
  },
};

export const NUDGE_COOLDOWN_MS = {
  low: 3 * 60 * 1000,
  medium: 2 * 60 * 1000,
  high: 90 * 1000,
};

// Talk time thresholds per session type (not affected by sensitivity)
export const TALK_TIME_THRESHOLDS = {
  lecture:  { min: 70, max: 85 },
  practice: { min: 30, max: 55 },
  socratic: { min: 40, max: 65 },
};
