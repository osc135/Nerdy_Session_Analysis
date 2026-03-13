# AI-Powered Live Session Analysis — Decision Log & Architecture

> This document records all major architectural decisions, tradeoffs, and implementation plans made during project planning. It serves as the source of truth for why things were built the way they were.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Decisions](#architecture-decisions)
3. [Tech Stack](#tech-stack)
4. [System Architecture](#system-architecture)
5. [File Structure](#file-structure)
6. [Engagement Metrics Design](#engagement-metrics-design)
7. [Coaching Nudge Design](#coaching-nudge-design)
8. [Session Report Design](#session-report-design)
9. [Known Tradeoffs & Limitations](#known-tradeoffs--limitations)
10. [Build Plan](#build-plan)
11. [Evaluation Criteria Mapping](#evaluation-criteria-mapping)

---

## Project Overview

A browser-based, real-time coaching system for live video tutoring sessions. The system analyzes engagement metrics (eye contact, speaking time, interruptions, energy level) during a live session and provides non-intrusive coaching nudges to the tutor. A full post-session report is generated at the end of each session.

**Key constraint:** Everything runs in the browser — no installation required. This qualifies for the +3 bonus points for browser-based implementation.

---

## Architecture Decisions

### Decision 1: Browser-Based Implementation
**Choice:** Fully browser-based using WebRTC, MediaPipe (WebAssembly), and Web Audio API.

**Rationale:**
- Earns +3 bonus points per evaluation criteria
- No installation barrier for tutors or students
- MediaPipe runs entirely client-side via WebAssembly, keeping video data off the server
- Web Audio API is built into every modern browser

**Alternative considered:** Python backend with OpenCV. Rejected due to installation complexity and no bonus points.

---

### Decision 2: Each Side Analyzes Itself
**Choice:** The tutor's browser analyzes the tutor's own face/voice. The student's browser analyzes the student's own face/voice. Both share metric *numbers* (not video) via a WebRTC data channel.

**Rationale:**
- Significantly lighter CPU load — each machine only runs MediaPipe on one face
- More accurate results since each person's metrics are computed locally with full-resolution video
- Student can see their own metrics in real time without routing data through the tutor
- Natural fit for the post-session merged report (each side contributes its own data)

**Alternative considered:** Tutor's machine analyzes both streams. Rejected — doubles CPU usage on the tutor's machine and makes student metrics less accurate due to compressed WebRTC video.

**Data flow:**
```
Tutor Browser                          Student Browser
┌─────────────────────┐                ┌─────────────────────┐
│ MediaPipe (tutor)   │                │ MediaPipe (student) │
│ Web Audio (tutor)   │                │ Web Audio (student) │
│                     │◄──── metrics ──│                     │
│ Receives student    │──── metrics ──►│ Receives tutor      │
│ metrics in sidebar  │                │ metrics in panel    │
└─────────────────────┘                └─────────────────────┘
```

---

### Decision 3: Real WebRTC Peer-to-Peer Connection
**Choice:** Actual WebRTC connection between two computers using a lightweight Node.js signaling server.

**Rationale:**
- Two physical computers are available for development and testing
- Real peer-to-peer is far more impressive for evaluation than a simulated setup
- Demonstrates the system works in a real two-person scenario

**Signaling server choice:** Simple Node.js WebSocket server (~30 lines). Chosen over PeerJS cloud for full control and no third-party dependency risk during demo.

**Known limitation:** Without a TURN server, connection may fail on strict corporate/institutional networks. Acceptable for demo environment. See [Tradeoffs](#known-tradeoffs--limitations).

---

### Decision 4: MySQL Session Persistence
**Choice:** The Node.js server persists session data in MySQL, enabling trend analysis across multiple sessions.

**Rationale:**
- Reliable concurrent access for multiple sessions
- Structured queries for trend aggregation
- Docker Compose setup keeps it simple for development

**End-of-session data flow:**
```
Tutor clicks "End Session"
    │
    ▼
Server broadcasts "session_ending" to both clients
    │
    ├──► Tutor browser flushes metric history → POST /api/sessions/:id/tutor
    └──► Student browser flushes metric history → POST /api/sessions/:id/student
    │
    ▼
Server merges both datasets into one session record
    │
    ▼
Server broadcasts "report_ready" to both clients
    │
    ├──► Tutor receives full merged report (all metrics + nudge log)
    └──► Student receives personal summary only
```

**Graceful disconnect:** If student disconnects mid-session, their browser automatically flushes available data before closing, so no data is lost.

---

### Decision 5: Threshold-Based Coaching Nudges
**Choice:** Hard-coded thresholds detect when a metric is problematic. When triggered, a contextual coaching nudge is generated and displayed to the tutor.

**Rationale:**
- Thresholds are fast (<50ms) and reliable — catch obvious cases immediately
- Nudges are pre-authored for each trigger type, ensuring consistent quality
- No external API dependency means nudges work offline and with zero latency
- Configurable sensitivity (low/medium/high) adjusts threshold values and cooldown timers

**Example:**
```
Threshold fires: student_silence_duration > 180 seconds
    │
    ▼
Nudge engine checks deduplication timer (last nudge of this type?)
    │
    ▼
Nudge generated: "Your student hasn't spoken in over 3 minutes.
   Try asking an open-ended question to re-engage them."
    │
    ▼
Nudge appears in tutor sidebar
```

---

### Decision 6: What Each Side Sees

**Tutor sees:**
- Live webcam feeds (tutor + student)
- Full metrics sidebar (all metrics for both participants, live Recharts graphs)
- Coaching nudge panel
- Post-session: full merged report with PDF export

**Student sees:**
- Their own webcam feed
- Simple personal metrics panel (eye contact, speaking time, energy)
- Post-session: personal summary only (not the tutor's coaching data)

**Rationale:** Coaching nudges are private to the tutor — showing them to the student would be distracting and awkward. Student metrics panel is motivating and transparent without being disruptive.

---

### Decision 7: Consent Screen on Load
**Choice:** Both tutor and student see a consent screen when they open the app, before any camera or microphone access is requested.

**Rationale:** The evaluation rubric specifically grades privacy handling. A clear consent screen demonstrates awareness of the ethical considerations of real-time video analysis.

**What the consent screen covers:**
- What data is being collected (face landmarks, voice activity, metric scores)
- What is NOT stored (no raw video or audio leaves the browser)
- How long session data is retained
- Who can see the analytics (tutor sees full report, student sees personal summary)
- That analysis is happening in real time and can be stopped at any time

---

## Tech Stack

| Layer | Technology | Purpose | Why Chosen |
|---|---|---|---|
| Video analysis | MediaPipe Face Mesh (WebAssembly) | Face detection, gaze estimation, expressions | Runs in-browser, no install, highly accurate |
| Audio analysis | Web Audio API | Voice activity, speaking time, energy, interruptions | Built into every browser, no library needed |
| Real-time connection | WebRTC (native browser) | Peer-to-peer video/audio/data | Standard, low latency, no server relay for media |
| Signaling | Node.js + WebSocket (`ws` library) | Broker WebRTC connection | ~30 lines, full control, no third-party dependency |
| Database | MySQL 9.4 | Persist session data for trend analysis | Reliable, concurrent access, Docker Compose setup |
| Frontend framework | React 18 | Component-based UI | Clean for complex real-time dashboard |
| Charts | Recharts | Live metric graphs | React-native, smooth real-time updates |
| Auth | JWT + bcrypt | Role-based authentication | Lightweight, stateless |
| PDF export | jsPDF | Downloadable post-session report | Runs in-browser, no server needed |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TUTOR'S BROWSER                         │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Webcam     │───►│  MediaPipe   │───►│   Metrics    │  │
│  │   + Mic      │    │  Face Mesh   │    │   Engine     │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘  │
│                                                 │           │
│  ┌──────────────┐                               │           │
│  │  Web Audio   │───────────────────────────────┤           │
│  │     API      │                               │           │
│  └──────────────┘                        ┌──────▼───────┐  │
│                                          │  Threshold   │  │
│  ┌──────────────┐    ┌──────────────┐    │   Engine     │  │
│  │   Student    │───►│  Dashboard   │    └──────┬───────┘  │
│  │   Metrics    │    │  Sidebar     │           │           │
│  │  (received)  │    │  (Recharts)  │    ┌──────▼───────┐  │
│  └──────────────┘    └──────────────┘    │   Coaching   │  │
│          ▲                               │    Nudges    │  │
│          │ WebRTC Data Channel           └──────────────┘  │
└──────────┼──────────────────────────────────────────────────┘
           │
           │  (metric numbers only, no video/audio)
           │
┌──────────┼──────────────────────────────────────────────────┐
│          ▼            STUDENT'S BROWSER                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Webcam     │───►│  MediaPipe   │───►│   Personal   │  │
│  │   + Mic      │    │  Face Mesh   │    │   Metrics    │  │
│  └──────────────┘    └──────────────┘    │    Panel     │  │
│                                          └──────────────┘  │
│  ┌──────────────┐                                           │
│  │  Web Audio   │───────────────────────────────────────►  │
│  │     API      │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
           │
           │  WebRTC Signaling (connection setup only)
           │
┌──────────▼──────────────────────────────────────────────────┐
│                    NODE.JS SERVER                           │
│                                                             │
│   WebSocket Signaling  │  Session Storage API              │
│   (broker connection)  │  POST /api/sessions/:id/tutor     │
│                        │  POST /api/sessions/:id/student   │
│                        │  GET  /api/sessions/:id/report    │
│                        │  GET  /api/sessions/history       │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
/
├── server/
│   ├── index.js                  — WebSocket signaling + Express session API
│   ├── auth.js                   — JWT auth routes (signup/login/me)
│   ├── db.js                     — MySQL connection + schema init
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── App.jsx               — Root component, routing (tutor/student views)
│   │   │
│   │   ├── components/
│   │   │   ├── ConsentScreen.jsx         — Privacy consent gate on load
│   │   │   ├── TutorView.jsx             — Main tutor session view
│   │   │   ├── StudentView.jsx           — Student session view (simpler)
│   │   │   ├── VideoLayout.jsx           — PiP video call layout
│   │   │   ├── MetricsSidebar.jsx        — Live metrics dashboard (Recharts)
│   │   │   ├── NudgePanel.jsx            — Coaching nudge display
│   │   │   ├── MetricGauge.jsx           — Individual metric gauge component
│   │   │   ├── TimelineChart.jsx         — Live scrolling timeline (Recharts)
│   │   │   ├── PostSessionReport.jsx     — In-browser report view + PDF export
│   │   │   ├── Dashboard.jsx             — Session history + trends
│   │   │   ├── LoginPage.jsx             — Role-based auth
│   │   │   └── CalibrationScreen.jsx     — Gaze calibration
│   │   │
│   │   ├── hooks/
│   │   │   ├── useMediaPipe.js           — Face mesh + gaze + expression analysis
│   │   │   ├── useWebRTC.js              — Peer connection + data channel
│   │   │   ├── useAudioAnalysis.js       — Speaking time, energy, interruptions
│   │   │   └── useNudgeEngine.js         — Threshold monitoring + nudge logic
│   │   │
│   │   ├── utils/
│   │   │   ├── thresholds.js             — Configurable metric thresholds
│   │   │   ├── metricsHistory.js         — In-memory metric buffer for session
│   │   │   ├── reportGenerator.js        — Builds report data structure from history
│   │   │   ├── pdfExport.js              — jsPDF downloadable report
│   │   │   └── gazeCalibration.js        — Calibration utilities
│   │   │
│   │   └── contexts/
│   │       └── AuthContext.jsx            — JWT auth state
│   │
│   └── package.json
│
├── docs/
│   ├── DECISION_LOG.md           — This document
│   ├── PRIVACY_ANALYSIS.md       — Detailed privacy analysis
│   └── CALIBRATION.md            — Metric accuracy calibration notes
│
├── docker-compose.yml            — MySQL container
└── README.md                     — Setup and usage instructions
```

---

## Engagement Metrics Design

### 1. Eye Contact / Gaze
**What is measured:** Whether each participant is looking at the camera (screen center). Computed as a rolling percentage over the last 30 seconds.

**How:** MediaPipe Face Mesh provides 468 facial landmarks. Iris landmarks are used to estimate gaze direction. If gaze vector points within a threshold angle of the camera center, it counts as eye contact.

**Displayed as:** 0-100% gauge, updated at ~1 Hz. Timeline graph shows trend over session.

**Threshold for nudge:** Tutor eye contact drops below 40% for 30+ consecutive seconds.

---

### 2. Speaking Time Balance
**What is measured:** Percentage of total session time each participant has been speaking. Ideal ranges:
- Lecture/explanation: 70-80% tutor
- Practice/review: 30-50% tutor
- Socratic discussion: 40-60% tutor

**How:** Web Audio API voice activity detection on each local microphone. Each side tracks their own speaking time and shares cumulative seconds via data channel.

**Displayed as:** Split bar showing tutor % vs student %, updated every 2 seconds.

**Threshold for nudge:** Tutor talk time exceeds 80% for 5+ consecutive minutes.

---

### 3. Interruptions
**What is measured:** Overlapping speech — both participants' voice activity detected simultaneously. Tracked as a running count and a rate (interruptions per minute).

**How:** Each side detects their own voice activity. When both sides report speaking simultaneously (cross-referenced via data channel timestamps), an interruption is logged.

**Displayed as:** Live counter in sidebar. Timeline shows interruption spikes.

**Threshold for nudge:** 3 or more interruptions within any 2-minute window.

---

### 4. Energy Level
**What is measured:** A composite score (0-100) combining voice volume variance, speech rate, and facial expression valence (neutral vs. engaged/positive).

**How:**
- Voice energy: RMS amplitude and variance from Web Audio API
- Facial energy: MediaPipe expression landmarks (eyebrow raise, smile, eye openness)
- Combined as weighted average: 60% audio, 40% facial

**Displayed as:** Color-coded gauge (red -> yellow -> green). Timeline shows trend.

**Threshold for nudge:** Either participant's energy score drops by 20+ points over 5 minutes.

---

### 5. Attention Drift (Composite)
**What is measured:** A derived signal that combines falling eye contact + falling energy + prolonged silence to detect disengagement.

**Displayed as:** Warning indicator in sidebar when multiple signals align.

---

## Coaching Nudge Design

### Principles
1. **Non-intrusive** — Appears only in the tutor's sidebar. Never covers the video feed.
2. **Actionable** — Every nudge suggests a specific behavior ("Ask an open-ended question")
3. **Timely** — Delivered when the pattern is established, not on a single data point
4. **Private** — Student never sees coaching nudges
5. **Configurable** — Sensitivity can be adjusted in settings (low / medium / high)

### Nudge Deduplication
The same nudge type cannot fire more than once every 5 minutes. This prevents the sidebar from becoming overwhelming.

### Nudge Types

| Trigger | Condition | Example Message |
|---|---|---|
| Student silence | No student speech for 3+ min | "Your student hasn't spoken in over 3 minutes. Try asking an open-ended question." |
| Low eye contact | Tutor eye contact <40% for 30s | "You've been looking away from the camera. Try making more eye contact with your student." |
| Talk time imbalance | Tutor >80% for 5+ min | "You've been doing most of the talking. Consider pausing to check for understanding." |
| Energy drop | Either participant energy drops 20pt | "Engagement seems to be dropping. A short break or change of activity might help." |
| Interruption spike | 3+ interruptions in 2 min | "There have been several interruptions. Try giving a bit more wait time before responding." |
| Mutual disengagement | Both eye contact + energy low | "Both of you seem less engaged. Consider switching to an interactive activity." |

### Nudge Generation
When a threshold fires, the nudge engine evaluates the current metric context and selects an appropriate coaching message. Messages are pre-authored for each trigger type and can incorporate current metric values for specificity. The nudge is displayed immediately in the sidebar with a priority color indicator (low/medium/high).

---

## Session Report Design

### Tutor Report (Full)
Available in-browser and as downloadable PDF.

Sections:
1. **Session Overview** — Date, duration, subject, overall engagement score
2. **Talk Time Summary** — Final ratio, trend over session
3. **Eye Contact Summary** — Average scores for both participants, trend
4. **Interruption Analysis** — Total count, rate, timeline of spikes
5. **Energy Analysis** — Average levels, biggest drops and their timestamps
6. **Key Moments** — Automatically flagged moments (attention drops, engagement peaks)
7. **Nudge Log** — All coaching nudges delivered during session
8. **Trend Analysis** — Comparison to previous sessions (if available)
9. **Recommendations** — 3-5 personalized suggestions for next session

### Student Report (Personal Summary)
Simpler view, shown in-browser only (no PDF).

Sections:
1. **Your Participation** — Speaking time percentage
2. **Your Engagement** — Eye contact and energy trend
3. **Session Duration** — Total time

---

## Known Tradeoffs & Limitations

| Tradeoff | Description | Production Fix |
|---|---|---|
| No TURN server | WebRTC connection may fail on strict corporate/institutional networks where direct peer connections are blocked | Add a TURN relay server (e.g. Twilio Network Traversal) |
| Single face assumption | MediaPipe assumes one face per stream — multi-person rooms not handled | Add face tracking IDs to associate metrics per person |
| Gaze estimation accuracy | Camera angle and lighting significantly affect accuracy. Accuracy degrades with glasses, certain skin tones, and low light | Calibration step at session start (user looks at screen center, corners) |
| Audio interruption detection | Detecting true interruptions vs. background noise requires VAD tuning — false positives possible | Train a dedicated VAD model or use Silero VAD |
| Browser tab must stay active | MediaPipe and Web Audio API pause when the tab is backgrounded in some browsers | Service Worker or Web Worker workaround |
| MediaPipe CPU usage | Running Face Mesh at 30fps is CPU-intensive. Throttling to 10-15fps reduces accuracy | Offload to WebGPU when available |

---

## Build Plan

### Day 1 — Foundation
- [x] Node.js server: WebSocket signaling (broker WebRTC connection)
- [x] Node.js server: Session storage API endpoints
- [x] WebRTC connection working end-to-end between two computers
- [x] Consent screen component (both views)
- [x] MediaPipe Face Mesh running on local webcam
- [x] Basic gaze score calculation from iris landmarks
- [x] Basic expression energy score from facial landmarks

### Day 2 — Metrics + Real-Time UI
- [x] Web Audio API: voice activity detection
- [x] Speaking time calculation (per side, cumulative)
- [x] Interruption detection (cross-referencing both sides via data channel)
- [x] Energy composite score (audio + facial)
- [x] WebRTC data channel sending metric objects at 1 Hz
- [x] Tutor MetricsSidebar with live Recharts graphs for all 4 metrics
- [x] Student personal metrics panel
- [x] Threshold engine (configurable, with deduplication timer)

### Day 3 — Nudges + Report + Polish
- [x] Threshold-based nudge generation
- [x] NudgePanel with priority color coding
- [x] End session flow (flush -> merge -> report ready)
- [x] PostSessionReport component (in-browser)
- [x] PDF export with jsPDF
- [x] Trend analysis (compare to previous sessions)
- [x] End-to-end test on both computers
- [ ] Privacy documentation + calibration notes

---

## Evaluation Criteria Mapping

| Criteria | Weight | Our Approach |
|---|---|---|
| Real-Time Performance | 25% | MediaPipe at 10-15fps, metric updates at 1 Hz, target <300ms latency |
| Metric Accuracy | 25% | MediaPipe for face/gaze (validated), Web Audio VAD for speaking time |
| Coaching Value | 20% | Threshold-based nudges, configurable sensitivity, full post-session report |
| Technical Implementation | 15% | Modular React + hooks architecture, tests covering core logic |
| Documentation | 15% | This decision log, PRIVACY_ANALYSIS.md, CALIBRATION.md |
| **Bonus: Browser-based** | +3 | Fully browser-based, no install required |
| **Bonus: Metrics visualization** | +2 | Live Recharts dashboard with timeline, gauges, and trend charts |

---

*Last updated: Project planning phase. Update this document as implementation decisions evolve.*
