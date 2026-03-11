// gazeCalibration.js — Ridge regression mapping (iris + head pose) → screen position
//
// Calibration collects iris ratios and head pose at known screen locations,
// then fits a linear model:  screenPos = W * [1, irisX, irisY, yaw, pitch]
//
// During the session, the model predicts where on screen the user is looking
// and returns a continuous confidence score (1.0 = on screen, 0.0 = far off).

const RIDGE_LAMBDA = 0.01;

/**
 * Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(A, b) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxRow !== col) [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n];
    for (let j = i + 1; j < n; j++) sum -= aug[i][j] * x[j];
    x[i] = Math.abs(aug[i][i]) > 1e-12 ? sum / aug[i][i] : 0;
  }
  return x;
}

/**
 * Ridge regression: β = (X^T X + λI)^{-1} X^T y
 */
function ridgeRegression(X, y) {
  const n = X.length;
  const p = X[0].length;

  const XtX = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }
  for (let j = 0; j < p; j++) XtX[j][j] += RIDGE_LAMBDA;

  const Xty = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) Xty[j] += X[i][j] * y[i];
  }

  return solveLinearSystem(XtX, Xty);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Build a calibration model from collected samples.
 *
 * @param calibrationPoints - array of:
 *   { screenX, screenY, samples: [{ irisX, irisY, headYaw, headPitch }] }
 * @returns model object or null if not enough data
 */
export function buildCalibrationModel(calibrationPoints) {
  const X = [];
  const yX = [];
  const yY = [];

  for (const point of calibrationPoints) {
    for (const s of point.samples) {
      X.push([1, s.irisX, s.irisY, s.headYaw / 90, s.headPitch / 90]);
      yX.push(point.screenX);
      yY.push(point.screenY);
    }
  }

  if (X.length < 5) return null;

  const coeffX = ridgeRegression(X, yX);
  const coeffY = ridgeRegression(X, yY);

  // Compute residual RMSE for confidence scaling
  let ssX = 0, ssY = 0;
  for (let i = 0; i < X.length; i++) {
    ssX += (dot(coeffX, X[i]) - yX[i]) ** 2;
    ssY += (dot(coeffY, X[i]) - yY[i]) ** 2;
  }

  return {
    coeffX: Array.from(coeffX),
    coeffY: Array.from(coeffY),
    rmseX: Math.sqrt(ssX / X.length),
    rmseY: Math.sqrt(ssY / X.length),
    numSamples: X.length,
  };
}

/**
 * Predict screen gaze position and return a confidence score.
 *
 * Screen coordinates are 0-100 (percentage of screen).
 * Confidence is 0-1: 1.0 = solidly on screen, 0.0 = clearly off screen.
 */
export function predictGaze(model, irisX, irisY, headYaw, headPitch) {
  const features = [1, irisX, irisY, headYaw / 90, headPitch / 90];
  const screenX = dot(model.coeffX, features);
  const screenY = dot(model.coeffY, features);

  // How far outside the screen (0-100) is the prediction?
  const overX = Math.max(0, -screenX, screenX - 100);
  const overY = Math.max(0, -screenY, screenY - 100);

  // Gaussian falloff outside screen edges, scaled by calibration noise
  const sigmaX = Math.max(model.rmseX * 2, 8);
  const sigmaY = Math.max(model.rmseY * 2, 8);
  const falloff = Math.exp(-(overX ** 2) / (2 * sigmaX ** 2) - (overY ** 2) / (2 * sigmaY ** 2));

  const confidence = Math.max(0, Math.min(1, falloff));
  return { screenX, screenY, confidence };
}

export function serializeModel(model) {
  return JSON.stringify(model);
}

export function deserializeModel(json) {
  try {
    const m = JSON.parse(json);
    return m && m.coeffX && m.coeffY ? m : null;
  } catch { return null; }
}
