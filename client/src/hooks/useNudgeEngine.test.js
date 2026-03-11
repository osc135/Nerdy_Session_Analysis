import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNudgeEngine } from './useNudgeEngine';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeLocalMetrics(overrides = {}) {
  return {
    isSpeaking: false,
    gazeScore: 80,
    getCumulativeMs: () => ({ speakingMs: 0, totalMs: 0 }),
    ...overrides,
  };
}

function makeRemoteMetrics(overrides = {}) {
  return {
    isSpeaking: false,
    gazeScore: 80,
    energy: 0.5,
    speakingMs: 0,
    ...overrides,
  };
}

function makeProps(overrides = {}) {
  return {
    localMetrics: makeLocalMetrics(overrides.localMetrics),
    remoteMetrics: makeRemoteMetrics(overrides.remoteMetrics),
    connectionState: 'connected',
    elapsed: 0,
    ...overrides,
  };
}

const CHECK_INTERVAL = 2000;
const COOLDOWN_MS = 2 * 60 * 1000;

// Advance time and flush React state updates
function advanceTime(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// ─── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Connection gating ──────────────────────────────────────────────

describe('useNudgeEngine – connection gating', () => {
  it('does not fire nudges when connectionState is not connected', () => {
    const { result } = renderHook(() =>
      useNudgeEngine(makeProps({ connectionState: 'disconnected' }))
    );

    advanceTime(CHECK_INTERVAL * 10);
    expect(result.current).toEqual([]);
  });

  it('does not fire nudges when remoteMetrics is null', () => {
    const props = makeProps({ remoteMetrics: null });
    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(CHECK_INTERVAL * 10);
    expect(result.current).toEqual([]);
  });
});

// ─── Student silence ────────────────────────────────────────────────

describe('useNudgeEngine – student_silence', () => {
  it('fires when student is silent for >= 3 minutes', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 0 },
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    // 3 minutes of silence = 90 checks at 2s each
    advanceTime(180_000 + CHECK_INTERVAL);

    const silenceNudge = result.current.find(n => n.type === 'student_silence');
    expect(silenceNudge).toBeDefined();
    expect(silenceNudge.message).toContain('hasn\'t spoken');
  });

  it('does NOT fire before 3 minutes of silence', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 0 },
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(170_000); // just under 3 min

    const silenceNudge = result.current.find(n => n.type === 'student_silence');
    expect(silenceNudge).toBeUndefined();
  });

  it('resets silence counter when student speaks', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 0 },
    });

    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: props }
    );

    // 2 minutes of silence
    advanceTime(120_000);

    // Student starts speaking — rerender with updated remote metrics
    const speakingProps = makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 1000 },
    });
    rerender(speakingProps);
    advanceTime(CHECK_INTERVAL);

    // Student stops again
    const silentAgainProps = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 1000 },
    });
    rerender(silentAgainProps);

    // Another 2 minutes (total 4 min elapsed, but only 2 min of new silence)
    advanceTime(120_000);

    const silenceNudge = result.current.find(n => n.type === 'student_silence');
    expect(silenceNudge).toBeUndefined();
  });
});

// ─── Low eye contact ────────────────────────────────────────────────

describe('useNudgeEngine – low_eye_contact', () => {
  it('fires when gaze < 40 for >= 30 seconds', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 20, energy: 0.5, speakingMs: 5000 },
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(32_000);

    const gazeNudge = result.current.find(n => n.type === 'low_eye_contact');
    expect(gazeNudge).toBeDefined();
    expect(gazeNudge.message).toContain('eye contact');
  });

  it('does NOT fire when gaze >= 40', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 50, energy: 0.5, speakingMs: 5000 },
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(60_000);

    const gazeNudge = result.current.find(n => n.type === 'low_eye_contact');
    expect(gazeNudge).toBeUndefined();
  });

  it('does NOT fire when gaze is low for less than 30 seconds', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 20, energy: 0.5, speakingMs: 5000 },
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(25_000);

    const gazeNudge = result.current.find(n => n.type === 'low_eye_contact');
    expect(gazeNudge).toBeUndefined();
  });

  it('resets duration when gaze returns above 40', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 20, energy: 0.5, speakingMs: 5000 },
    });

    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: props }
    );

    // 20 seconds of low gaze
    advanceTime(20_000);

    // Gaze recovers
    rerender(makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 60, energy: 0.5, speakingMs: 5000 },
    }));
    advanceTime(CHECK_INTERVAL);

    // Low gaze again for 20 seconds (not enough since it reset)
    rerender(makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 20, energy: 0.5, speakingMs: 5000 },
    }));
    advanceTime(20_000);

    const gazeNudge = result.current.find(n => n.type === 'low_eye_contact');
    expect(gazeNudge).toBeUndefined();
  });
});

// ─── Talk time imbalance ────────────────────────────────────────────

describe('useNudgeEngine – talk_time_imbalance', () => {
  it('fires when tutor talks above session type threshold after 5 min', () => {
    const props = makeProps({
      localMetrics: {
        isSpeaking: false,
        getCumulativeMs: () => ({ speakingMs: 250_000, totalMs: 300_000 }),
      },
      remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 50_000 },
      elapsed: 310, // > 300 seconds
      sessionType: 'practice', // threshold 55%, tutor at 83%
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(CHECK_INTERVAL);

    const talkNudge = result.current.find(n => n.type === 'talk_time_imbalance');
    expect(talkNudge).toBeDefined();
    expect(talkNudge.message).toContain('student should be doing most of the work');
  });

  it('does NOT fire before 5 minutes into the session', () => {
    const props = makeProps({
      localMetrics: {
        isSpeaking: false,
        getCumulativeMs: () => ({ speakingMs: 200_000, totalMs: 240_000 }),
      },
      remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 30_000 },
      elapsed: 250, // < 300 seconds
      sessionType: 'practice',
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(CHECK_INTERVAL);

    const talkNudge = result.current.find(n => n.type === 'talk_time_imbalance');
    expect(talkNudge).toBeUndefined();
  });

  it('does NOT fire when tutor talks within session type range', () => {
    const props = makeProps({
      localMetrics: {
        isSpeaking: false,
        getCumulativeMs: () => ({ speakingMs: 150_000, totalMs: 300_000 }),
      },
      remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 150_000 },
      elapsed: 310,
      sessionType: 'socratic', // threshold 65%, tutor at 50% — within range
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(CHECK_INTERVAL);

    const talkNudge = result.current.find(n => n.type === 'talk_time_imbalance');
    expect(talkNudge).toBeUndefined();
  });
});

// ─── Energy drop ────────────────────────────────────────────────────

describe('useNudgeEngine – energy_drop', () => {
  it('fires when energy drops by >= 20 points over the window', () => {
    // Start with high energy
    const props = makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.7, speakingMs: 5000 },
    });

    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: props }
    );

    // Let high energy establish in the history
    advanceTime(CHECK_INTERVAL * 3);

    // Drop energy significantly
    rerender(makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.4, speakingMs: 5000 },
    }));

    advanceTime(CHECK_INTERVAL);

    const energyNudge = result.current.find(n => n.type === 'energy_drop');
    expect(energyNudge).toBeDefined();
    expect(energyNudge.message).toContain('energy');
  });

  it('does NOT fire when energy drops by less than 20 points', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
    });

    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: props }
    );

    advanceTime(CHECK_INTERVAL * 3);

    // Small drop (50 -> 40 = 10 points)
    rerender(makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.4, speakingMs: 5000 },
    }));

    advanceTime(CHECK_INTERVAL);

    const energyNudge = result.current.find(n => n.type === 'energy_drop');
    expect(energyNudge).toBeUndefined();
  });

  it('does NOT fire when energy increases', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.3, speakingMs: 5000 },
    });

    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: props }
    );

    advanceTime(CHECK_INTERVAL * 3);

    rerender(makeProps({
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.7, speakingMs: 5000 },
    }));

    advanceTime(CHECK_INTERVAL);

    const energyNudge = result.current.find(n => n.type === 'energy_drop');
    expect(energyNudge).toBeUndefined();
  });
});

// ─── Interruption spike ─────────────────────────────────────────────

describe('useNudgeEngine – interruption_spike', () => {
  it('fires when 3+ interruptions occur within 2 minutes', () => {
    // Both speaking = interruption
    const props = makeProps({
      localMetrics: makeLocalMetrics({ isSpeaking: true }),
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
    });

    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: props }
    );

    // Generate 3 interruptions by toggling both-speaking on/off
    for (let i = 0; i < 3; i++) {
      // Both speaking
      rerender(makeProps({
        localMetrics: makeLocalMetrics({ isSpeaking: true }),
        remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
      }));
      advanceTime(CHECK_INTERVAL);

      // Only tutor speaking (gap so next overlap counts as new interruption)
      rerender(makeProps({
        localMetrics: makeLocalMetrics({ isSpeaking: true }),
        remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
      }));
      advanceTime(CHECK_INTERVAL);
    }

    const intNudge = result.current.find(n => n.type === 'interruption_spike');
    expect(intNudge).toBeDefined();
    expect(intNudge.message).toContain('interruptions');
  });

  it('does NOT fire with fewer than 3 interruptions', () => {
    const props = makeProps({
      localMetrics: makeLocalMetrics({ isSpeaking: true }),
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
    });

    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: props }
    );

    // Generate only 2 interruptions
    for (let i = 0; i < 2; i++) {
      rerender(makeProps({
        localMetrics: makeLocalMetrics({ isSpeaking: true }),
        remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
      }));
      advanceTime(CHECK_INTERVAL);

      rerender(makeProps({
        localMetrics: makeLocalMetrics({ isSpeaking: true }),
        remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
      }));
      advanceTime(CHECK_INTERVAL);
    }

    const intNudge = result.current.find(n => n.type === 'interruption_spike');
    expect(intNudge).toBeUndefined();
  });

  it('expires old interruptions after 2 minutes', () => {
    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: makeProps({
        localMetrics: makeLocalMetrics({ isSpeaking: true }),
        remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
      })}
    );

    // 2 interruptions
    for (let i = 0; i < 2; i++) {
      rerender(makeProps({
        localMetrics: makeLocalMetrics({ isSpeaking: true }),
        remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
      }));
      advanceTime(CHECK_INTERVAL);
      rerender(makeProps({
        localMetrics: makeLocalMetrics({ isSpeaking: true }),
        remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
      }));
      advanceTime(CHECK_INTERVAL);
    }

    // Wait 2+ minutes so those interruptions expire
    rerender(makeProps({
      localMetrics: makeLocalMetrics({ isSpeaking: false }),
      remoteMetrics: { isSpeaking: false, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
    }));
    advanceTime(125_000);

    // 1 more interruption (total recent = 1, not 3)
    rerender(makeProps({
      localMetrics: makeLocalMetrics({ isSpeaking: true }),
      remoteMetrics: { isSpeaking: true, gazeScore: 80, energy: 0.5, speakingMs: 5000 },
    }));
    advanceTime(CHECK_INTERVAL);

    const intNudge = result.current.find(n => n.type === 'interruption_spike');
    expect(intNudge).toBeUndefined();
  });
});

// ─── Cooldown ───────────────────────────────────────────────────────

describe('useNudgeEngine – cooldown', () => {
  it('does not fire the same nudge type twice within 5 minutes', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 20, energy: 0.5, speakingMs: 0 },
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    // Trigger low_eye_contact
    advanceTime(35_000);

    const first = result.current.filter(n => n.type === 'low_eye_contact');
    expect(first).toHaveLength(1);

    // Keep conditions met for another minute — should NOT fire again
    advanceTime(60_000);

    const stillOne = result.current.filter(n => n.type === 'low_eye_contact');
    expect(stillOne).toHaveLength(1);
  });

  it('fires the same nudge again after cooldown expires', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 20, energy: 0.5, speakingMs: 0 },
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    // Trigger low_eye_contact
    advanceTime(35_000);
    expect(result.current.filter(n => n.type === 'low_eye_contact')).toHaveLength(1);

    // Wait for cooldown to expire (5 min)
    advanceTime(COOLDOWN_MS);

    const afterCooldown = result.current.filter(n => n.type === 'low_eye_contact');
    expect(afterCooldown).toHaveLength(2);
  });

  it('allows different nudge types to fire independently', () => {
    // Conditions that trigger both silence and low eye contact
    const props = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 20, energy: 0.5, speakingMs: 0 },
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    // Low eye contact fires at ~30s, silence fires at ~3min
    advanceTime(185_000);

    const types = result.current.map(n => n.type);
    expect(types).toContain('low_eye_contact');
    expect(types).toContain('student_silence');
  });
});

// ─── Nudge shape ────────────────────────────────────────────────────

describe('useNudgeEngine – nudge object shape', () => {
  it('includes message, timestamp, and type', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 20, energy: 0.5, speakingMs: 0 },
      elapsed: 45,
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(35_000);

    const nudge = result.current[0];
    expect(nudge).toHaveProperty('message');
    expect(nudge).toHaveProperty('timestamp');
    expect(nudge).toHaveProperty('type');
    expect(typeof nudge.message).toBe('string');
    expect(typeof nudge.timestamp).toBe('string');
    expect(typeof nudge.type).toBe('string');
  });

  it('formats timestamp as m:ss', () => {
    const props = makeProps({
      remoteMetrics: { isSpeaking: false, gazeScore: 20, energy: 0.5, speakingMs: 0 },
      elapsed: 125, // 2:05
    });

    const { result } = renderHook(() => useNudgeEngine(props));

    advanceTime(35_000);

    expect(result.current[0].timestamp).toBe('2:05');
  });
});

// ─── Cleanup ────────────────────────────────────────────────────────

describe('useNudgeEngine – lifecycle', () => {
  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() =>
      useNudgeEngine(makeProps())
    );

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('starts checking when connectionState changes to connected', () => {
    const props = makeProps({ connectionState: 'connecting' });

    const { result, rerender } = renderHook(
      (p) => useNudgeEngine(p),
      { initialProps: props }
    );

    // Low gaze but not connected — no nudge
    const lowGazeDisconnected = {
      ...props,
      remoteMetrics: { isSpeaking: false, gazeScore: 20, energy: 0.5, speakingMs: 0 },
    };
    rerender(lowGazeDisconnected);
    advanceTime(35_000);
    expect(result.current).toEqual([]);

    // Now connect
    rerender({ ...lowGazeDisconnected, connectionState: 'connected' });
    advanceTime(35_000);

    const gazeNudge = result.current.find(n => n.type === 'low_eye_contact');
    expect(gazeNudge).toBeDefined();
  });
});
