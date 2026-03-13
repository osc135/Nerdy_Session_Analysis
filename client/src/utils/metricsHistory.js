// In-memory metric buffer for the current session
// Stores timestamped metric snapshots for post-session report

import { createLogger } from './logger';

const logMetrics = createLogger('Metrics');
const logSession = createLogger('Session');

export class MetricsHistory {
  constructor() {
    this.snapshots = [];
    this.nudges = [];
    this.startTime = null;
  }

  start() {
    this.startTime = Date.now();
    logSession.info('Session recording started');
  }

  addSnapshot(tutorMetrics, studentMetrics) {
    const snap = {
      timestamp: Date.now(),
      elapsed: this.startTime ? Date.now() - this.startTime : 0,
      tutor: { ...tutorMetrics },
      student: { ...studentMetrics },
    };
    this.snapshots.push(snap);

    // Log every 5th snapshot (~10s at 2s intervals)
    if (this.snapshots.length % 5 === 0) {
      const t = snap.tutor;
      const s = snap.student;
      logMetrics.info(
        `Snapshot #${this.snapshots.length}: tutor gaze=${t.gazeScore ?? '-'}% talk=${t.speakingMs ? Math.round(t.speakingMs / 1000) + 's' : '-'} energy=${t.energy ?? '-'} | student gaze=${s.gazeScore ?? '-'}% talk=${s.speakingMs ? Math.round(s.speakingMs / 1000) + 's' : '-'} energy=${s.energy ?? '-'}`
      );
    }
  }

  addNudge(nudge) {
    this.nudges.push({
      timestamp: Date.now(),
      elapsed: this.startTime ? Date.now() - this.startTime : 0,
      ...nudge,
    });
  }

  getHistory() {
    const history = {
      startTime: this.startTime,
      endTime: Date.now(),
      duration: this.startTime ? Date.now() - this.startTime : 0,
      snapshots: this.snapshots,
      nudges: this.nudges,
    };
    logSession.info(`Session ended: ${this.snapshots.length} snapshots, ${this.nudges.length} nudges, duration=${Math.round(history.duration / 1000)}s`);
    return history;
  }

  clear() {
    this.snapshots = [];
    this.nudges = [];
    this.startTime = null;
  }
}
