import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(__dirname, 'sessions');

if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = createServer(app);

// --- WebSocket Signaling Server ---
const wss = new WebSocketServer({ server, path: '/ws' });

// Room-based signaling: clients join a session room
const rooms = new Map(); // sessionId -> { tutor: ws, student: ws }

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentRole = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'join': {
          const { sessionId, role } = msg;
          currentRoom = sessionId;
          currentRole = role;

          if (!rooms.has(sessionId)) {
            rooms.set(sessionId, { tutor: null, student: null });
          }
          const room = rooms.get(sessionId);
          room[role] = ws;

          // Notify the other peer that someone joined
          const otherRole = role === 'tutor' ? 'student' : 'tutor';
          if (room[otherRole]?.readyState === 1) {
            room[otherRole].send(JSON.stringify({ type: 'peer_joined', role }));
            ws.send(JSON.stringify({ type: 'peer_joined', role: otherRole }));
          }

          ws.send(JSON.stringify({ type: 'joined', sessionId, role }));
          console.log(`[${sessionId}] ${role} joined`);
          break;
        }

        // WebRTC signaling relay
        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          if (!currentRoom) break;
          const room = rooms.get(currentRoom);
          if (!room) break;
          const targetRole = currentRole === 'tutor' ? 'student' : 'tutor';
          if (room[targetRole]?.readyState === 1) {
            room[targetRole].send(JSON.stringify(msg));
          }
          break;
        }

        case 'session_ending': {
          if (!currentRoom) break;
          const room = rooms.get(currentRoom);
          if (!room) break;
          // Broadcast to both clients
          for (const role of ['tutor', 'student']) {
            if (room[role]?.readyState === 1) {
              room[role].send(JSON.stringify({ type: 'session_ending', sessionId: currentRoom }));
            }
          }
          console.log(`[${currentRoom}] session ending`);
          break;
        }
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      if (room[currentRole] === ws) {
        room[currentRole] = null;
      }
      // Notify other peer
      const otherRole = currentRole === 'tutor' ? 'student' : 'tutor';
      if (room[otherRole]?.readyState === 1) {
        room[otherRole].send(JSON.stringify({ type: 'peer_left', role: currentRole }));
      }
      // Clean up empty rooms
      if (!room.tutor && !room.student) {
        rooms.delete(currentRoom);
      }
      console.log(`[${currentRoom}] ${currentRole} left`);
    }
  });
});

// --- Session Storage API ---

// Save tutor metrics for a session
app.post('/api/sessions/:id/tutor', (req, res) => {
  const sessionFile = join(SESSIONS_DIR, `${req.params.id}.json`);
  const session = loadSession(sessionFile);
  session.tutor = req.body;
  session.updatedAt = new Date().toISOString();
  saveSession(sessionFile, session);
  checkAndMerge(session, sessionFile, req.params.id);
  res.json({ status: 'ok' });
});

// Save student metrics for a session
app.post('/api/sessions/:id/student', (req, res) => {
  const sessionFile = join(SESSIONS_DIR, `${req.params.id}.json`);
  const session = loadSession(sessionFile);
  session.student = req.body;
  session.updatedAt = new Date().toISOString();
  saveSession(sessionFile, session);
  checkAndMerge(session, sessionFile, req.params.id);
  res.json({ status: 'ok' });
});

// Get session report
app.get('/api/sessions/:id/report', (req, res) => {
  const sessionFile = join(SESSIONS_DIR, `${req.params.id}.json`);
  if (!existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const session = JSON.parse(readFileSync(sessionFile, 'utf-8'));
  res.json(session);
});

// Get session history for trend analysis
app.get('/api/sessions/history', (req, res) => {
  if (!existsSync(SESSIONS_DIR)) return res.json([]);
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  const sessions = files.map(f => {
    const data = JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8'));
    return {
      sessionId: data.sessionId,
      createdAt: data.createdAt,
      duration: data.duration,
      engagementScore: data.report?.engagementScore,
    };
  });
  res.json(sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// --- Claude API proxy for nudge generation ---
app.post('/api/nudge', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: req.body.prompt,
        },
      ],
      system: `You are a real-time coaching assistant for a live tutoring session. Generate a single, concise coaching nudge for the tutor based on the engagement metrics provided. The nudge should be:
- One sentence, actionable and specific
- Suggest a concrete behavior change
- Empathetic and supportive in tone
- Never reference the AI system or metrics directly

Respond with ONLY the nudge message, nothing else.`,
    });

    const nudge = response.content[0].text;
    res.json({ nudge });
  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: 'Failed to generate nudge' });
  }
});

// --- Helpers ---
function loadSession(file) {
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf-8'));
  }
  return { createdAt: new Date().toISOString() };
}

function saveSession(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function checkAndMerge(session, file, sessionId) {
  if (session.tutor && session.student) {
    session.sessionId = sessionId;
    session.merged = true;
    session.mergedAt = new Date().toISOString();
    saveSession(file, session);

    // Notify both clients that report is ready
    const room = rooms.get(sessionId);
    if (room) {
      for (const role of ['tutor', 'student']) {
        if (room[role]?.readyState === 1) {
          room[role].send(JSON.stringify({ type: 'report_ready', sessionId }));
        }
      }
    }
    console.log(`[${sessionId}] report merged and ready`);
  }
}

// --- Start ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket signaling on ws://localhost:${PORT}/ws`);
});
