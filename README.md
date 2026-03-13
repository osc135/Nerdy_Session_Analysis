# AI-Powered Live Session Analysis

Real-time engagement analysis and coaching for live video tutoring sessions. Runs entirely in the browser — no installation required for end users.

## Quick Start

### Prerequisites

- Node.js 18+
- Docker (for MySQL)

### Setup

```bash
# 1. Start MySQL
docker compose up -d

# 2. Configure environment
cp server/.env.example server/.env

# 3. Install dependencies and start
npm run install:all
npm run dev
```

The app opens at `http://localhost:5173`. The server runs on port 3001.

### Running Tests

```bash
npm test
```

## How It Works

Two participants (tutor + student) join a session through the browser. Each side captures their own webcam and microphone, analyzes engagement locally using MediaPipe and Web Audio API, and shares only numeric metric scores over a WebRTC data channel. No raw video or audio ever leaves the browser.

### Session Flow

1. **Sign up / Log in** — choose Tutor or Student role
2. **Consent screen** — explains what is analyzed and what is not stored
3. **Tutor creates a session** — selects session type (lecture/practice/socratic) and nudge sensitivity (low/medium/high), receives a session code
4. **Student joins** — enters the tutor's session code
5. **Live session** — real-time metrics displayed, coaching nudges delivered to tutor
6. **Session ends** — both sides flush metric history to the server
7. **Post-session report** — interactive analytics with PDF export

## Architecture

```
Tutor's Browser                             Student's Browser
┌───────────────────────────┐               ┌───────────────────────────┐
│  Webcam + Mic             │               │  Webcam + Mic             │
│       │                   │               │       │                   │
│  MediaPipe Face Mesh      │               │  MediaPipe Face Mesh      │
│  (gaze, expressions)      │               │  (gaze, expressions)      │
│       │                   │               │       │                   │
│  Web Audio API            │               │  Web Audio API            │
│  (VAD, speaking time)     │               │  (VAD, speaking time)     │
│       │                   │               │       │                   │
│  Metric numbers ◄─── WebRTC Data Channel ──► Metric numbers          │
│       │                   │               │       │                   │
│  Metrics Sidebar          │               │  Personal Metrics Panel   │
│  Nudge Engine             │               │                           │
│  Coaching Nudge Toasts    │               │                           │
└───────────────────────────┘               └───────────────────────────┘
                │                                       │
                │         WebRTC Signaling               │
                └──────────────┬────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Node.js Server    │
                    │                     │
                    │  WebSocket Signaling│
                    │  REST API (sessions)│
                    │  MySQL (persistence)│
                    └─────────────────────┘
```

Each side analyzes itself — the tutor's browser runs MediaPipe on the tutor's face, the student's browser runs it on the student's face. This halves CPU load per machine and produces more accurate results since each side has full-resolution local video.

## Engagement Metrics

| Metric | How It's Measured | Nudge Trigger |
|---|---|---|
| **Eye Contact** | MediaPipe iris landmarks + head pose, 30s rolling window, 0-100% | < 40% for 30s |
| **Speaking Time** | Web Audio API voice activity detection at 100ms intervals | Tutor > 80% for 5 min |
| **Interruptions** | Overlapping speech detected via cross-referenced VAD signals | 3+ in 2 min window |
| **Energy Level** | 60% facial expressiveness (blendshapes) + 40% vocal tone (pitch/volume variance) | 20+ point drop |
| **Attention Drift** | Composite of low gaze + low energy + silence | Sustained for 12-30s |

Talk time targets vary by session type:
- **Lecture:** 70-85% tutor
- **Practice:** 30-55% tutor
- **Socratic:** 40-65% tutor

## Coaching Nudges

When a metric threshold is exceeded, the nudge engine generates a contextual coaching suggestion displayed as a toast notification to the tutor only.

- **Non-intrusive** — toasts in the corner
- **Deduplicated** — same nudge type cannot fire more than once per 2-5 minutes
- **Configurable** — three sensitivity levels (low / medium / high) control thresholds and cooldowns
- **Private** — student never sees coaching nudges

## Post-Session Report

The tutor receives a full interactive report with:
- Overall engagement score (weighted composite)
- Per-participant eye contact, talk time, and energy gauges
- Talk time balance donut chart with session-type benchmarks
- Session timeline (Recharts graphs)
- Key moments (sustained attention drops, long silences, attention drift)
- Full nudge log
- Personalized recommendations
- PDF export

Students see a session-ended confirmation and can review their participation from the dashboard.

## Performance

- **Video analysis:** MediaPipe Face Mesh at 15 FPS via WebAssembly (GPU-accelerated where available, CPU fallback)
- **Metric updates:** sent over data channel every 500ms, snapshots recorded every 2s
- **Nudge latency:** threshold check every 2s, nudge displayed immediately
- **Audio analysis:** VAD polling at 100ms intervals

## Tech Stack

| Layer | Technology |
|---|---|
| Video analysis | MediaPipe Face Mesh (WebAssembly) |
| Audio analysis | Web Audio API |
| Real-time connection | WebRTC (native browser API) |
| Signaling | Node.js + WebSocket (`ws`) |
| Frontend | React 18 + Vite |
| Charts | Recharts |
| Coaching nudges | Threshold-based engine with configurable sensitivity |
| Database | MySQL 9.4 |
| Auth | JWT + bcrypt |
| PDF export | jsPDF |
| Testing | Vitest + React Testing Library |

## Privacy

- Raw video and audio **never leave the browser** — only numeric metric scores are shared
- Consent screen is shown before any camera/microphone access
- Coaching nudges are visible only to the tutor
- Students see only their own personal metrics
- Session data stored as numeric metrics in MySQL — no recordings

See `docs/DECISION_LOG.md`, `docs/PRIVACY_ANALYSIS.md`, and `docs/CALIBRATION.md` for full documentation.

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── components/          UI components
│   │   │   ├── TutorView.jsx        Tutor session interface
│   │   │   ├── StudentView.jsx      Student session interface
│   │   │   ├── VideoLayout.jsx      PiP video call layout
│   │   │   ├── MetricsSidebar.jsx   Live metrics dashboard
│   │   │   ├── NudgePanel.jsx       Coaching nudge toasts
│   │   │   ├── PostSessionReport.jsx Report viewer + charts
│   │   │   ├── Dashboard.jsx        Session history + trends
│   │   │   ├── LoginPage.jsx        Role-based auth
│   │   │   ├── ConsentScreen.jsx    Privacy consent + session setup
│   │   │   ├── CalibrationScreen.jsx Gaze calibration
│   │   │   ├── MetricGauge.jsx      Gauge visualization
│   │   │   └── TimelineChart.jsx    Recharts timeline
│   │   ├── hooks/               Custom React hooks
│   │   │   ├── useMediaPipe.js      Face mesh + gaze + expressions
│   │   │   ├── useWebRTC.js         WebRTC peer connection + signaling
│   │   │   ├── useAudioAnalysis.js  Voice activity detection + energy
│   │   │   └── useNudgeEngine.js    Threshold monitoring + nudge logic
│   │   ├── utils/               Shared utilities
│   │   │   ├── thresholds.js        Configurable nudge thresholds
│   │   │   ├── metricsHistory.js    Session metric buffer
│   │   │   ├── reportGenerator.js   Post-session report builder
│   │   │   ├── pdfExport.js         PDF generation
│   │   │   └── gazeCalibration.js   Calibration utilities
│   │   └── contexts/
│   │       └── AuthContext.jsx      JWT auth state
│   └── vite.config.js
├── server/
│   ├── index.js                 Express + WebSocket + REST API
│   ├── auth.js                  Auth routes (signup/login/me)
│   └── db.js                    MySQL connection + schema init
├── presearch.md                 Decision log + architecture doc
├── docker-compose.yml           MySQL container
└── package.json                 Root monorepo scripts
```

## Known Limitations

- **No TURN server** — WebRTC may fail behind symmetric NATs or strict firewalls
- **Single face per stream** — MediaPipe assumes one participant per camera
- **Gaze accuracy varies** — affected by camera angle, lighting, and glasses
- **Browser tab must stay active** — MediaPipe and Web Audio pause when backgrounded
