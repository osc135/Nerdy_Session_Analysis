// In-memory metric buffer for the current session
// Stores timestamped metric snapshots for post-session report

export class MetricsHistory {
  constructor() {
    this.snapshots = [];
    this.nudges = [];
    this.startTime = null;
  }

  start() {
    this.startTime = Date.now();
  }

  addSnapshot(tutorMetrics, studentMetrics) {
    this.snapshots.push({
      timestamp: Date.now(),
      elapsed: this.startTime ? Date.now() - this.startTime : 0,
      tutor: { ...tutorMetrics },
      student: { ...studentMetrics },
    });
  }

  addNudge(nudge) {
    this.nudges.push({
      timestamp: Date.now(),
      elapsed: this.startTime ? Date.now() - this.startTime : 0,
      ...nudge,
    });
  }

  getHistory() {
    return {
      startTime: this.startTime,
      endTime: Date.now(),
      duration: this.startTime ? Date.now() - this.startTime : 0,
      snapshots: this.snapshots,
      nudges: this.nudges,
    };
  }

  clear() {
    this.snapshots = [];
    this.nudges = [];
    this.startTime = null;
  }
}
