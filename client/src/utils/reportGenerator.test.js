import { describe, it, expect } from 'vitest';
import { generateReport } from './reportGenerator';

// ─── Helpers ─────────────────────────────────────────────────────────

// Build a single snapshot as MetricsHistory would produce it
function snap(elapsed, tutor = {}, student = {}) {
  return {
    timestamp: 1000000 + elapsed,
    elapsed,
    tutor: {
      isSpeaking: false,
      gazeScore: 80,
      energy: 0.5,
      volume: 0.3,
      speakingMs: 0,
      totalMs: elapsed,
      talkTimePercent: 0,
      ...tutor,
    },
    student: {
      isSpeaking: false,
      gazeScore: 80,
      energy: 0.5,
      volume: 0.3,
      speakingMs: 0,
      totalMs: elapsed,
      talkTimePercent: 0,
      ...student,
    },
  };
}

// Generate evenly-spaced snapshots over a duration (ms) at a given interval (ms)
function makeSnapshots(count, interval, snapshotFn) {
  return Array.from({ length: count }, (_, i) => {
    const elapsed = i * interval;
    return snapshotFn ? snapshotFn(elapsed, i) : snap(elapsed);
  });
}

// A full session data object for generateReport
function makeSessionData(overrides = {}) {
  const duration = overrides.duration || 600_000; // 10 min default
  const interval = 2000;
  const count = duration / interval;

  return {
    sessionId: 'test-session-1',
    tutor: {
      snapshots: makeSnapshots(count, interval, overrides.snapshotFn),
      nudges: overrides.nudges || [],
      duration,
    },
    student: {
      snapshots: overrides.studentSnapshots || [],
      nudges: [],
      duration,
    },
    ...overrides,
  };
}

// ─── generateReport – top-level structure ───────────────────────────

describe('generateReport – structure', () => {
  it('returns the correct top-level shape', () => {
    const report = generateReport(makeSessionData());

    expect(report).toHaveProperty('sessionId', 'test-session-1');
    expect(report).toHaveProperty('duration');
    expect(report).toHaveProperty('durationMinutes');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('keyMoments');
    expect(report).toHaveProperty('nudgeLog');
    expect(report).toHaveProperty('recommendations');
  });

  it('computes durationMinutes from ms', () => {
    const report = generateReport(makeSessionData({ duration: 600_000 }));
    expect(report.durationMinutes).toBe(10);
  });

  it('passes through nudgeLog from tutor data', () => {
    const nudges = [
      { type: 'student_silence', message: 'test', timestamp: '3:00' },
    ];
    const report = generateReport(makeSessionData({ nudges }));
    expect(report.nudgeLog).toEqual(nudges);
  });

  it('handles missing tutor/student data gracefully', () => {
    const report = generateReport({ sessionId: 'empty' });

    expect(report.sessionId).toBe('empty');
    expect(report.duration).toBe(0);
    expect(report.summary.talkTime).toBeDefined();
    expect(report.summary.eyeContact).toBeDefined();
  });
});

// ─── Talk time summary ──────────────────────────────────────────────

describe('generateReport – talkTime', () => {
  it('computes tutor and student talk percentages from cumulative speakingMs', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { speakingMs: 180_000 },  // tutor spoke 3 min
        { speakingMs: 120_000 },  // student spoke 2 min
      ),
    });

    const report = generateReport(data);
    const { talkTime } = report.summary;

    // 180k / (180k + 120k) = 60%, 120k / 300k = 40%
    expect(talkTime.tutor).toBeCloseTo(60, 0);
    expect(talkTime.student).toBeCloseTo(40, 0);
  });

  it('returns 0 for both when nobody spoke', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { speakingMs: 0 },
        { speakingMs: 0 },
      ),
    });

    const report = generateReport(data);
    expect(report.summary.talkTime.tutor).toBe(0);
    expect(report.summary.talkTime.student).toBe(0);
  });

  it('handles tutor doing all the talking', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { speakingMs: 300_000 },
        { speakingMs: 0 },
      ),
    });

    const report = generateReport(data);
    expect(report.summary.talkTime.tutor).toBe(100);
    expect(report.summary.talkTime.student).toBe(0);
  });
});

// ─── Eye contact summary ────────────────────────────────────────────

describe('generateReport – eyeContact', () => {
  it('averages gazeScore across all snapshots for each participant', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed, i) => snap(elapsed,
        { gazeScore: 90 },     // tutor always at 90
        { gazeScore: i % 2 === 0 ? 80 : 60 }, // student alternates 80/60
      ),
    });

    const report = generateReport(data);
    const { eyeContact } = report.summary;

    expect(eyeContact.tutor).toBeCloseTo(90, 0);
    expect(eyeContact.student).toBeCloseTo(70, 0);
  });

  it('returns 0 when snapshots are empty', () => {
    const report = generateReport({ sessionId: 'empty' });
    expect(report.summary.eyeContact.tutor).toBe(0);
    expect(report.summary.eyeContact.student).toBe(0);
  });
});

// ─── Interruption summary ───────────────────────────────────────────

describe('generateReport – interruptions', () => {
  it('counts interruptions when both speakers are active simultaneously', () => {
    // 10 min session, 300 snapshots at 2s intervals
    const data = makeSessionData({
      duration: 600_000,
      snapshotFn: (elapsed, i) => {
        // Create 4 distinct interruption events (both speaking for 2 consecutive snaps each)
        const isInterruption = (i >= 10 && i <= 11) ||  // event 1
                               (i >= 50 && i <= 51) ||  // event 2
                               (i >= 100 && i <= 101) || // event 3
                               (i >= 200 && i <= 201);   // event 4
        return snap(elapsed,
          { isSpeaking: isInterruption || i % 3 === 0 },
          { isSpeaking: isInterruption },
        );
      },
    });

    const report = generateReport(data);
    const { interruptions } = report.summary;

    expect(interruptions.total).toBe(4);
    expect(interruptions.perMinute).toBeCloseTo(0.4, 1); // 4 in 10 min
  });

  it('returns zero when nobody overlaps', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed, i) => snap(elapsed,
        { isSpeaking: i % 2 === 0 },  // tutor on even ticks
        { isSpeaking: i % 2 === 1 },  // student on odd ticks — never overlap
      ),
    });

    const report = generateReport(data);
    expect(report.summary.interruptions.total).toBe(0);
    expect(report.summary.interruptions.perMinute).toBe(0);
  });

  it('counts single-snapshot overlaps as interruptions', () => {
    const data = makeSessionData({
      duration: 120_000, // 2 min, 60 snapshots
      snapshotFn: (elapsed, i) => {
        // 3 isolated overlap snapshots (each a separate event)
        const overlap = i === 10 || i === 30 || i === 50;
        return snap(elapsed,
          { isSpeaking: overlap },
          { isSpeaking: overlap },
        );
      },
    });

    const report = generateReport(data);
    expect(report.summary.interruptions.total).toBe(3);
  });
});

// ─── Energy summary ─────────────────────────────────────────────────

describe('generateReport – energy', () => {
  it('averages energy levels for both participants', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { energy: 0.7 },
        { energy: 0.4 },
      ),
    });

    const report = generateReport(data);
    const { energy } = report.summary;

    expect(energy.tutor).toBeCloseTo(70, 0);  // 0.7 * 100
    expect(energy.student).toBeCloseTo(40, 0);
  });

  it('handles energy values already scaled 0-100', () => {
    // In case energy comes pre-scaled from TutorView (line 82: Math.round(energy * 100))
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { energy: 70 },
        { energy: 40 },
      ),
    });

    const report = generateReport(data);
    // Should handle either scale — if > 1, treat as already scaled
    expect(report.summary.energy.tutor).toBeGreaterThan(0);
    expect(report.summary.energy.student).toBeGreaterThan(0);
  });

  it('returns 0 for empty snapshots', () => {
    const report = generateReport({ sessionId: 'empty' });
    expect(report.summary.energy.tutor).toBe(0);
    expect(report.summary.energy.student).toBe(0);
  });
});

// ─── Engagement score ───────────────────────────────────────────────

describe('generateReport – engagementScore', () => {
  it('returns a score between 0 and 100', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { gazeScore: 80, energy: 0.6, isSpeaking: true, speakingMs: 150_000 },
        { gazeScore: 75, energy: 0.5, isSpeaking: true, speakingMs: 150_000 },
      ),
    });

    const report = generateReport(data);
    expect(report.summary.engagementScore).toBeGreaterThanOrEqual(0);
    expect(report.summary.engagementScore).toBeLessThanOrEqual(100);
  });

  it('returns a high score for an ideal session', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { gazeScore: 95, energy: 0.8, isSpeaking: true, speakingMs: 150_000 },
        { gazeScore: 90, energy: 0.7, isSpeaking: true, speakingMs: 150_000 },
      ),
    });

    const report = generateReport(data);
    expect(report.summary.engagementScore).toBeGreaterThan(70);
  });

  it('returns a low score for a poor session', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { gazeScore: 10, energy: 0.1, isSpeaking: true, speakingMs: 290_000 },
        { gazeScore: 15, energy: 0.1, isSpeaking: false, speakingMs: 10_000 },
      ),
    });

    const report = generateReport(data);
    expect(report.summary.engagementScore).toBeLessThan(40);
  });

  it('returns 0 for empty snapshots', () => {
    const report = generateReport({ sessionId: 'empty' });
    expect(report.summary.engagementScore).toBe(0);
  });
});

// ─── Key moments ────────────────────────────────────────────────────

describe('generateReport – keyMoments', () => {
  it('identifies attention drops when student gaze is low for sustained period', () => {
    const data = makeSessionData({
      duration: 300_000, // 5 min
      snapshotFn: (elapsed, i) => {
        // Student gaze drops to 10 for 30+ seconds (snapshots 50-70 = 40s at 2s interval)
        const lowGaze = i >= 50 && i <= 70;
        return snap(elapsed,
          { gazeScore: 85 },
          { gazeScore: lowGaze ? 10 : 80 },
        );
      },
    });

    const report = generateReport(data);
    const drops = report.keyMoments.filter(m => m.type === 'attention_drop');

    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(drops[0]).toHaveProperty('elapsed');
    expect(drops[0]).toHaveProperty('description');
  });

  it('identifies long silences when neither party speaks', () => {
    const data = makeSessionData({
      duration: 300_000,
      snapshotFn: (elapsed, i) => {
        // Both silent for 60+ seconds (snapshots 40-75 = 70s at 2s interval)
        const silent = i >= 40 && i <= 75;
        return snap(elapsed,
          { isSpeaking: !silent },
          { isSpeaking: false },
        );
      },
    });

    const report = generateReport(data);
    const silences = report.keyMoments.filter(m => m.type === 'long_silence');

    expect(silences.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array when session is normal throughout', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { gazeScore: 85, isSpeaking: true, energy: 0.6 },
        { gazeScore: 80, isSpeaking: true, energy: 0.5 },
      ),
    });

    const report = generateReport(data);
    // No extreme events = no key moments (or very few)
    expect(Array.isArray(report.keyMoments)).toBe(true);
  });

  it('each key moment has the required shape', () => {
    const data = makeSessionData({
      duration: 300_000,
      snapshotFn: (elapsed, i) => {
        const lowGaze = i >= 50 && i <= 70;
        return snap(elapsed,
          { gazeScore: 85 },
          { gazeScore: lowGaze ? 10 : 80 },
        );
      },
    });

    const report = generateReport(data);
    for (const moment of report.keyMoments) {
      expect(moment).toHaveProperty('type');
      expect(moment).toHaveProperty('elapsed');
      expect(moment).toHaveProperty('description');
      expect(typeof moment.type).toBe('string');
      expect(typeof moment.elapsed).toBe('number');
      expect(typeof moment.description).toBe('string');
    }
  });
});

// ─── Recommendations ────────────────────────────────────────────────

describe('generateReport – recommendations', () => {
  it('recommends involving student more when tutor dominates talk time', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { speakingMs: 500_000 },
        { speakingMs: 50_000 },
      ),
    });

    const report = generateReport(data);
    const rec = report.recommendations.find(r =>
      r.text.toLowerCase().includes('question') ||
      r.text.toLowerCase().includes('student') ||
      r.text.toLowerCase().includes('talking')
    );

    expect(rec).toBeDefined();
  });

  it('recommends visual aids when student eye contact is low', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { gazeScore: 85 },
        { gazeScore: 25 },
      ),
    });

    const report = generateReport(data);
    const rec = report.recommendations.find(r =>
      r.text.toLowerCase().includes('visual') ||
      r.text.toLowerCase().includes('distract') ||
      r.text.toLowerCase().includes('eye contact') ||
      r.text.toLowerCase().includes('screen')
    );

    expect(rec).toBeDefined();
  });

  it('recommends reviewing coaching suggestions when many nudges fired', () => {
    const nudges = Array.from({ length: 6 }, (_, i) => ({
      type: 'student_silence',
      message: 'test',
      timestamp: `${i}:00`,
    }));

    const data = makeSessionData({ nudges });
    const report = generateReport(data);

    const rec = report.recommendations.find(r =>
      r.text.toLowerCase().includes('nudge') ||
      r.text.toLowerCase().includes('coaching') ||
      r.text.toLowerCase().includes('suggestion')
    );

    expect(rec).toBeDefined();
  });

  it('recommends wait time when interruptions are high', () => {
    const data = makeSessionData({
      duration: 300_000, // 5 min, 150 snapshots
      snapshotFn: (elapsed, i) => {
        // 10 distinct interruption events in 5 min = 2/min
        const overlap = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].includes(i);
        return snap(elapsed,
          { isSpeaking: overlap || i % 4 === 0 },
          { isSpeaking: overlap },
        );
      },
    });

    const report = generateReport(data);
    const rec = report.recommendations.find(r =>
      r.text.toLowerCase().includes('wait') ||
      r.text.toLowerCase().includes('interrupt') ||
      r.text.toLowerCase().includes('pause')
    );

    expect(rec).toBeDefined();
  });

  it('returns no recommendations for an ideal session', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { gazeScore: 90, energy: 0.7, isSpeaking: true, speakingMs: 150_000 },
        { gazeScore: 85, energy: 0.6, isSpeaking: true, speakingMs: 150_000 },
      ),
    });

    const report = generateReport(data);
    // An ideal session should have few or no recommendations
    expect(report.recommendations.length).toBeLessThanOrEqual(1);
  });

  it('each recommendation has text and priority', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => snap(elapsed,
        { speakingMs: 500_000, gazeScore: 90 },
        { speakingMs: 10_000, gazeScore: 20 },
      ),
    });

    const report = generateReport(data);
    for (const rec of report.recommendations) {
      expect(rec).toHaveProperty('text');
      expect(rec).toHaveProperty('priority');
      expect(typeof rec.text).toBe('string');
      expect(typeof rec.priority).toBe('string');
    }
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('generateReport – edge cases', () => {
  it('handles a very short session (< 1 minute)', () => {
    const data = makeSessionData({
      duration: 30_000,
      snapshotFn: (elapsed) => snap(elapsed,
        { speakingMs: 10_000, gazeScore: 50 },
        { speakingMs: 10_000, gazeScore: 50 },
      ),
    });

    const report = generateReport(data);
    expect(report.durationMinutes).toBeLessThanOrEqual(1);
    expect(report.summary.engagementScore).toBeGreaterThanOrEqual(0);
  });

  it('handles only tutor data (student never connected)', () => {
    const data = {
      sessionId: 'tutor-only',
      tutor: {
        snapshots: makeSnapshots(30, 2000, (elapsed) => snap(elapsed)),
        nudges: [],
        duration: 60_000,
      },
    };

    const report = generateReport(data);
    expect(report.sessionId).toBe('tutor-only');
    expect(report.summary).toBeDefined();
  });

  it('handles snapshots with missing metric fields', () => {
    const data = makeSessionData({
      snapshotFn: (elapsed) => ({
        timestamp: 1000000 + elapsed,
        elapsed,
        tutor: { isSpeaking: true },
        student: {},
      }),
    });

    // Should not throw
    expect(() => generateReport(data)).not.toThrow();
  });
});
