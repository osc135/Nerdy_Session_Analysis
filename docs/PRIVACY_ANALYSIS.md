# Privacy Analysis

> Detailed analysis of data collection, processing, storage, and access control for the AI-Powered Live Session Analysis system.

---

## Data Classification

### Processed Locally (Never Leaves the Browser)
- **Raw video frames** — captured from webcam, fed directly to MediaPipe Face Mesh, then discarded
- **Raw audio stream** — captured from microphone, analyzed by Web Audio API, then discarded
- **Facial landmark coordinates** — 468 points per frame from MediaPipe, used to compute gaze and expression scores, then discarded
- **Voice activity boolean** — per-frame speaking/not-speaking signal, used to compute speaking time, then discarded

### Shared Between Clients (WebRTC Data Channel)
- **Numeric metric scores only** — e.g., `eye_contact: 0.72`, `speaking: true`, `energy: 65`
- Sent peer-to-peer over encrypted WebRTC data channel
- No video, audio, or facial landmarks are transmitted
- Metric objects are sent at ~1 Hz (every 500ms-1s)

### Stored on Server (MySQL)
- **Session metric history** — timestamped arrays of numeric scores for both participants
- **Coaching nudges delivered** — nudge type, message text, timestamp
- **Session metadata** — session code, start/end time, session type, sensitivity setting
- **User accounts** — email, name, hashed password, role (tutor/student)

### NOT Collected or Stored
- Raw video frames — never sent to server, never stored anywhere
- Raw audio — never sent to server, never stored anywhere
- Facial landmark coordinates — never sent to server
- Personally identifiable biometric data — no face embeddings, no voiceprints
- Screen recordings or screenshots

---

## Consent Flow

Both tutor and student see a consent screen when they open the app, **before** any camera or microphone access is requested.

### What the Consent Screen Explains
1. What data is being collected (face landmarks, voice activity, metric scores)
2. What is NOT stored (no raw video or audio leaves the browser)
3. How long session data is retained
4. Who can see the analytics (tutor sees full report, student sees personal summary)
5. That analysis is happening in real time and can be stopped at any time

### Consent Requirements
- Camera and microphone permissions are only requested **after** the user clicks "I consent"
- Users can leave the session at any time, which stops all analysis immediately
- No data collection occurs without explicit consent

---

## Access Control

| Data | Tutor Access | Student Access | Server Access |
|---|---|---|---|
| Own live metrics | Yes | Yes | No (client-side only) |
| Peer's live metrics | Yes (via data channel) | Yes (via data channel) | No |
| Coaching nudges | Yes (own session only) | No | Stored in session record |
| Full session report | Yes (own sessions) | No | Stored |
| Personal summary | N/A | Yes (own participation) | Derived from stored data |
| Raw video/audio | Local only | Local only | Never received |

### Role-Based Restrictions
- **Tutor report endpoint** (`GET /api/sessions/:id/report`) requires authentication and verifies the requesting user is the session's tutor
- **Session history** (`GET /api/sessions/history`) only returns sessions where the user is a participant
- **Students** never see coaching nudges or the tutor's metric analysis

---

## Data Retention

### Current Implementation (Demo)
Session data persists in MySQL until manually deleted. No automatic retention policy is enforced.

### Recommended Production Policy
- Session metric data: retain for 90 days, then auto-delete
- User accounts: retain while active, delete 30 days after account closure
- Coaching nudge logs: same lifecycle as session data
- No raw media is ever stored, so no media retention policy is needed

---

## Third-Party Data Sharing

### What is Shared Externally
- **Nothing.** No data is sent to any third-party service.

### Network Connections
- **WebRTC STUN server** (`stun.l.google.com:19302`) — used only for NAT traversal during connection setup. No session data is sent to Google; STUN only exchanges network address information.
- **WebRTC peer connection** — encrypted, peer-to-peer. Media and data channels do not route through the server.

---

## Security Measures

- All WebRTC connections use DTLS encryption (built into the protocol)
- Authentication via JWT tokens with bcrypt-hashed passwords
- Server API endpoints enforce role-based access control
- No sensitive data in URL parameters or query strings
- Session codes are random and not guessable

---

## Ethical Considerations

### Transparency
- The system clearly discloses what is being measured before any analysis begins
- Metric calculations are deterministic and explainable (threshold-based, not black-box)
- Both participants can see that analysis is happening

### Power Dynamics
- Coaching nudges are private to the tutor — students are not judged or scored visibly
- Student metrics panel shows only their own engagement, framed as self-awareness rather than surveillance
- The system is advisory — it suggests, never mandates

### Bias Considerations
- MediaPipe Face Mesh accuracy varies across skin tones, lighting conditions, and whether the user wears glasses
- Gaze estimation is calibrated per-session to reduce individual bias
- Energy scoring uses both facial and vocal signals to reduce dependence on any single modality
- These limitations are documented in CALIBRATION.md

---

*This analysis should be reviewed and updated as the system evolves, particularly if new data collection or third-party integrations are added.*
