// Configurable metric thresholds for coaching nudges
// Sensitivity levels: low, medium, high

export const THRESHOLDS = {
  studentSilence: {
    low: 300,    // 5 minutes
    medium: 180, // 3 minutes
    high: 120,   // 2 minutes
  },
  tutorEyeContact: {
    low: 0.30,
    medium: 0.40,
    high: 0.50,
  },
  tutorTalkTime: {
    low: 0.85,
    medium: 0.80,
    high: 0.75,
  },
  energyDrop: {
    low: 25,
    medium: 20,
    high: 15,
  },
  interruptionSpike: {
    low: 4,
    medium: 3,
    high: 2,
  },
};

export const NUDGE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between same nudge type
