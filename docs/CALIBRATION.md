# Calibration & Metric Accuracy

> Documents how each engagement metric is calculated, what affects its accuracy, and how calibration is performed.

---

## Gaze / Eye Contact

### How It Works
MediaPipe Face Mesh provides 468 facial landmarks including iris positions. Gaze direction is estimated by combining:
1. **Iris position** relative to the eye corners — determines where the eye is pointing
2. **Head pose** (pitch, yaw, roll) from facial landmark geometry — determines where the head is facing

A gaze score of 0-100% represents the rolling average (30-second window) of frames where the participant is estimated to be looking at the camera.

### Calibration Step
At session start, an optional calibration screen asks the user to look at specific points (center, corners) on the screen. This establishes:
- The user's baseline "looking at camera" iris position
- Compensation for camera angle offset (e.g., camera above or below the screen)
- Individual variation in eye geometry

### Accuracy Factors

| Factor | Impact | Mitigation |
|---|---|---|
| Camera angle | High — webcam above/below screen shifts baseline gaze | Calibration step compensates |
| Lighting | Medium — low light reduces iris detection confidence | MediaPipe confidence threshold filters low-quality frames |
| Glasses | Medium — reflections and refraction affect iris landmarks | Calibration helps; accuracy still lower than without glasses |
| Skin tone | Low-Medium — MediaPipe accuracy varies across demographics | Using latest MediaPipe model; documenting known limitations |
| Multi-monitor | Medium — looking at second monitor reads as "away" | Calibration can set a wider "on-screen" zone |
| Distance from camera | Low — works well at typical desk distances (40-80cm) | Very close or very far may degrade accuracy |

### Target Accuracy
- **85%+ accuracy** for binary "looking at camera vs. not" under good conditions (720p, adequate lighting, no glasses)
- **75%+ accuracy** with glasses or suboptimal lighting
- Validated by manual comparison during development sessions

---

## Speaking Time

### How It Works
Web Audio API captures the microphone stream and runs voice activity detection (VAD):
1. Audio is analyzed in 100ms intervals
2. RMS amplitude is compared against a noise floor threshold
3. Frames above the threshold are counted as "speaking"
4. Cumulative speaking time is tracked per participant

Each side detects their own voice activity locally and shares the result via the WebRTC data channel.

### Accuracy Factors

| Factor | Impact | Mitigation |
|---|---|---|
| Background noise | High — fans, typing, ambient noise cause false positives | Adaptive noise floor; initial silence period to calibrate |
| Microphone quality | Medium — cheap mics may clip or have noise | RMS normalization handles varying input levels |
| Crosstalk / echo | Medium — speaker audio leaking into mic | Echo cancellation is handled by WebRTC's built-in AEC |
| Speaking softly | Low-Medium — very quiet speech may fall below threshold | Threshold is set conservatively to catch soft speech |

### Target Accuracy
- **95%+ accuracy** for speaking time measurement with a decent microphone and low background noise
- Interruption detection (simultaneous speaking) has higher false positive rates due to echo and crosstalk

---

## Interruptions

### How It Works
An interruption is logged when both participants' VAD signals report "speaking" simultaneously:
1. Each side reports their speaking state via the data channel
2. When both are speaking at the same time, an overlap is detected
3. Overlap must persist for 300ms+ to count as an interruption (filters crosstalk/echo)
4. Tracked as running count and rate (interruptions per minute)

### Who Interrupted Whom
The system tracks which participant was already speaking when the overlap began. This determines the "interrupter" vs. the "interrupted" for the nudge log and report.

### Accuracy Factors

| Factor | Impact | Mitigation |
|---|---|---|
| Echo / crosstalk | High — biggest source of false positives | 300ms minimum overlap filter; WebRTC AEC |
| Network latency | Low — data channel latency is typically <50ms on LAN | Timestamp-based cross-referencing |
| Backchanneling | Medium — "uh huh", "yeah" during other's speech | Short utterances (<500ms) are not counted as interruptions |

### Target Accuracy
- Interruption detection is the least precise metric due to echo/crosstalk challenges
- Useful as a **relative indicator** (more interruptions = something to address) rather than an exact count
- False positive rate estimated at 10-20% in typical conditions

---

## Energy Level

### How It Works
A composite score (0-100) combining two signals:

**Vocal energy (60% weight):**
- RMS amplitude variance (monotone = low energy, varied = high energy)
- Pitch variance estimated from zero-crossing rate
- Computed from Web Audio API analyzer node

**Facial energy (40% weight):**
- MediaPipe blendshape scores for: eyebrow raise, smile, eye openness, jaw open
- Neutral face = low energy; expressive face = high energy
- Rolling average over 10-second window

### Calibration
Energy is relative — the system establishes a baseline during the first 30 seconds of the session and measures deviation from that baseline. This means:
- A naturally expressive person's "low energy" isn't penalized
- A naturally calm person's "normal" isn't flagged as low

### Accuracy Factors

| Factor | Impact | Mitigation |
|---|---|---|
| Individual expression style | High — some people are naturally less expressive | Baseline calibration in first 30 seconds |
| Cultural differences | Medium — expressiveness norms vary | Energy is advisory, not judgmental; framed as "change from baseline" |
| Microphone sensitivity | Low — affects vocal energy magnitude | RMS normalization |
| Lighting on face | Medium — affects blendshape detection | Confidence-weighted: low-confidence frames contribute less |

### Target Accuracy
- Energy is inherently subjective — there is no ground truth
- The metric is most useful for detecting **changes** (drops or spikes) rather than absolute levels
- A 20+ point drop over 5 minutes reliably correlates with observable disengagement in testing

---

## Attention Drift (Composite)

### How It Works
Attention drift is not a directly measured metric — it's a derived warning that fires when multiple signals align:
- Eye contact below threshold **AND**
- Energy below threshold **AND**
- Prolonged silence (no speech for N seconds)

All three must be true simultaneously for the attention drift indicator to activate.

### Why a Composite
Any single metric dropping can have innocent explanations (looking at notes, thinking before speaking, naturally calm demeanor). When all three drop together, disengagement is much more likely.

---

## General Notes

### MediaPipe Performance
- Face Mesh runs at 10-15 FPS (throttled from 30 to reduce CPU usage)
- WebAssembly execution with GPU acceleration where available, CPU fallback otherwise
- Confidence scores are used to discard low-quality detections
- Processing runs entirely in the browser — no frames are sent elsewhere

### Metric Update Frequency
- Internal metric computation: every 100ms (audio) / every frame (video, 10-15 FPS)
- Data channel metric sharing: every 500ms
- Metric history snapshots: every 2 seconds
- Dashboard UI updates: every 1 second

### Testing Methodology
Metrics were validated during development by:
1. Running sessions with known behaviors (looking away intentionally, staying silent, etc.)
2. Comparing computed metrics against manual observation
3. Adjusting thresholds based on false positive/negative rates
4. Testing across different lighting conditions and camera setups

---

*Update this document as metric algorithms are tuned or new validation data becomes available.*
