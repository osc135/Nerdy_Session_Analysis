// useNudgeEngine.js — Threshold monitoring + Claude API nudge generation
// Checks metrics against configurable thresholds, fires nudges with deduplication

import { useState, useCallback, useRef } from 'react';
import { THRESHOLDS } from '../utils/thresholds.js';

export function useNudgeEngine() {
  const [nudges, setNudges] = useState([]);
  const lastNudgeTime = useRef({});

  const checkThresholds = useCallback((tutorMetrics, studentMetrics) => {
    // TODO: Check each threshold
    // TODO: Enforce 5-minute deduplication per nudge type
    // TODO: Call /api/nudge for Claude-generated message
  }, []);

  return { nudges, checkThresholds };
}
