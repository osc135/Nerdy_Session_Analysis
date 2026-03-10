import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import pool from './db.js';
import authRouter, { requireAuth, optionalAuth } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(__dirname, 'sessions');

if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth routes
app.use('/api/auth', authRouter);

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
app.post('/api/sessions/:id/tutor', optionalAuth, async (req, res) => {
  try {
    const code = req.params.id;
    const userId = req.user?.id || null;

    // Upsert: create row if it doesn't exist
    const [existing] = await pool.query('SELECT id FROM sessions WHERE session_code = ?', [code]);
    if (existing.length === 0) {
      await pool.query(
        'INSERT INTO sessions (session_code, tutor_id, tutor_metrics) VALUES (?, ?, ?)',
        [code, userId, JSON.stringify(req.body)]
      );
    } else {
      await pool.query(
        'UPDATE sessions SET tutor_id = COALESCE(?, tutor_id), tutor_metrics = ?, ended_at = NOW() WHERE session_code = ?',
        [userId, JSON.stringify(req.body), code]
      );
    }

    // Check if both sides are saved
    const [rows] = await pool.query('SELECT * FROM sessions WHERE session_code = ?', [code]);
    if (rows[0]?.tutor_metrics && rows[0]?.student_metrics) {
      await pool.query('UPDATE sessions SET merged = TRUE WHERE session_code = ?', [code]);
      notifyReportReady(code);
    }

    // Also save to JSON for backward compatibility
    const sessionFile = join(SESSIONS_DIR, `${code}.json`);
    const session = loadSession(sessionFile);
    session.tutor = req.body;
    session.updatedAt = new Date().toISOString();
    saveSession(sessionFile, session);
    checkAndMerge(session, sessionFile, code);

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Save tutor metrics error:', err);
    res.status(500).json({ error: 'Failed to save metrics' });
  }
});

// Save student metrics for a session
app.post('/api/sessions/:id/student', optionalAuth, async (req, res) => {
  try {
    const code = req.params.id;
    const userId = req.user?.id || null;

    const [existing] = await pool.query('SELECT id FROM sessions WHERE session_code = ?', [code]);
    if (existing.length === 0) {
      await pool.query(
        'INSERT INTO sessions (session_code, student_id, student_metrics) VALUES (?, ?, ?)',
        [code, userId, JSON.stringify(req.body)]
      );
    } else {
      await pool.query(
        'UPDATE sessions SET student_id = COALESCE(?, student_id), student_metrics = ?, ended_at = NOW() WHERE session_code = ?',
        [userId, JSON.stringify(req.body), code]
      );
    }

    const [rows] = await pool.query('SELECT * FROM sessions WHERE session_code = ?', [code]);
    if (rows[0]?.tutor_metrics && rows[0]?.student_metrics) {
      await pool.query('UPDATE sessions SET merged = TRUE WHERE session_code = ?', [code]);
      notifyReportReady(code);
    }

    // Also save to JSON for backward compatibility
    const sessionFile = join(SESSIONS_DIR, `${code}.json`);
    const session = loadSession(sessionFile);
    session.student = req.body;
    session.updatedAt = new Date().toISOString();
    saveSession(sessionFile, session);
    checkAndMerge(session, sessionFile, code);

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Save student metrics error:', err);
    res.status(500).json({ error: 'Failed to save metrics' });
  }
});

// Get session report
app.get('/api/sessions/:id/report', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sessions WHERE session_code = ?', [req.params.id]);
    if (rows.length > 0 && rows[0].tutor_metrics) {
      const session = rows[0];
      return res.json({
        sessionId: session.session_code,
        tutor: typeof session.tutor_metrics === 'string' ? JSON.parse(session.tutor_metrics) : session.tutor_metrics,
        student: session.student_metrics ? (typeof session.student_metrics === 'string' ? JSON.parse(session.student_metrics) : session.student_metrics) : null,
        merged: session.merged,
        createdAt: session.created_at,
      });
    }

    // Fallback to JSON file
    const sessionFile = join(SESSIONS_DIR, `${req.params.id}.json`);
    if (!existsSync(sessionFile)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = JSON.parse(readFileSync(sessionFile, 'utf-8'));
    res.json(session);
  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// Get session history for the logged-in user
app.get('/api/sessions/history', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT session_code, tutor_id, student_id, tutor_metrics, student_metrics, merged, created_at, ended_at
       FROM sessions
       WHERE tutor_id = ? OR student_id = ?
       ORDER BY created_at DESC`,
      [req.user.id, req.user.id]
    );

    const sessions = rows.map(row => {
      const tutorMetrics = row.tutor_metrics ? (typeof row.tutor_metrics === 'string' ? JSON.parse(row.tutor_metrics) : row.tutor_metrics) : null;
      const studentMetrics = row.student_metrics ? (typeof row.student_metrics === 'string' ? JSON.parse(row.student_metrics) : row.student_metrics) : null;
      const role = row.tutor_id === req.user.id ? 'tutor' : 'student';

      return {
        sessionCode: row.session_code,
        role,
        merged: row.merged,
        createdAt: row.created_at,
        endedAt: row.ended_at,
        tutorMetrics,
        studentMetrics,
      };
    });

    res.json(sessions);
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

function notifyReportReady(sessionCode) {
  const room = rooms.get(sessionCode);
  if (room) {
    for (const role of ['tutor', 'student']) {
      if (room[role]?.readyState === 1) {
        room[role].send(JSON.stringify({ type: 'report_ready', sessionId: sessionCode }));
      }
    }
  }
}

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

initDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket signaling on ws://localhost:${PORT}/ws`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
