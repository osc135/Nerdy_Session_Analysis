// useMediaPipe.js — Face mesh + gaze + expression analysis
// Will initialize MediaPipe Face Mesh, process video frames,
// and return eye contact score + energy score

import { useState, useEffect, useRef, useCallback } from 'react';

export function useMediaPipe(videoRef) {
  const [gazeScore, setGazeScore] = useState(0);
  const [energyScore, setEnergyScore] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // TODO: Initialize MediaPipe Face Mesh
  // TODO: Process frames at 10-15fps
  // TODO: Calculate gaze from iris landmarks
  // TODO: Calculate expression energy from facial landmarks

  return { gazeScore, energyScore, isReady };
}
