import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import pool from './db.js';
import authRouter, { requireAuth, optionalAuth } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth routes
app.use('/api/auth', authRouter);

// Serve client build in production
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

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

    await pool.query(
      `INSERT INTO sessions (session_code, tutor_id, tutor_metrics)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE tutor_id = COALESCE(?, tutor_id), tutor_metrics = VALUES(tutor_metrics), ended_at = NOW()`,
      [code, userId, JSON.stringify(req.body), userId]
    );

    // Check if both sides are saved
    const [rows] = await pool.query('SELECT * FROM sessions WHERE session_code = ?', [code]);
    if (rows[0]?.tutor_metrics && rows[0]?.student_metrics) {
      await pool.query('UPDATE sessions SET merged = TRUE WHERE session_code = ?', [code]);
      notifyReportReady(code);
    }

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

    await pool.query(
      `INSERT INTO sessions (session_code, student_id, student_metrics)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE student_id = COALESCE(?, student_id), student_metrics = VALUES(student_metrics), ended_at = NOW()`,
      [code, userId, JSON.stringify(req.body), userId]
    );

    const [rows] = await pool.query('SELECT * FROM sessions WHERE session_code = ?', [code]);
    if (rows[0]?.tutor_metrics && rows[0]?.student_metrics) {
      await pool.query('UPDATE sessions SET merged = TRUE WHERE session_code = ?', [code]);
      notifyReportReady(code);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Save student metrics error:', err);
    res.status(500).json({ error: 'Failed to save metrics' });
  }
});

// Get session report (tutor only)
app.get('/api/sessions/:id/report', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sessions WHERE session_code = ?', [req.params.id]);
    if (rows.length === 0 || !rows[0].tutor_metrics) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = rows[0];
    if (session.tutor_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the tutor can view session reports' });
    }

    return res.json({
      sessionId: session.session_code,
      tutor: typeof session.tutor_metrics === 'string' ? JSON.parse(session.tutor_metrics) : session.tutor_metrics,
      student: session.student_metrics ? (typeof session.student_metrics === 'string' ? JSON.parse(session.student_metrics) : session.student_metrics) : null,
      merged: session.merged,
      createdAt: session.created_at,
    });
  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// Get aggregated trend metrics across all tutor sessions
app.get('/api/sessions/trends', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tutor_metrics, student_metrics
       FROM sessions
       WHERE tutor_id = ? AND merged = TRUE AND tutor_metrics IS NOT NULL
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.json({ sessionCount: 0, trends: null });
    }

    const summaries = [];
    for (const row of rows) {
      try {
        const tutor = typeof row.tutor_metrics === 'string' ? JSON.parse(row.tutor_metrics) : row.tutor_metrics;
        const student = row.student_metrics
          ? (typeof row.student_metrics === 'string' ? JSON.parse(row.student_metrics) : row.student_metrics)
          : null;
        const snaps = tutor?.snapshots || [];
        if (snaps.length === 0) continue;

        // Eye contact averages
        let tutorGazeSum = 0, studentGazeSum = 0;
        for (const s of snaps) {
          tutorGazeSum += s.tutor?.gazeScore || 0;
          studentGazeSum += s.student?.gazeScore || 0;
        }

        // Talk time from last snapshot
        const last = snaps[snaps.length - 1];
        const tutorMs = last.tutor?.speakingMs || 0;
        const studentMs = last.student?.speakingMs || 0;
        const totalMs = tutorMs + studentMs;

        // Energy averages
        let tutorEnergySum = 0, studentEnergySum = 0;
        for (const s of snaps) {
          const tE = s.tutor?.energy ?? 0;
          const sE = s.student?.energy ?? 0;
          tutorEnergySum += tE <= 1 ? tE * 100 : tE;
          studentEnergySum += sE <= 1 ? sE * 100 : sE;
        }

        // Interruption count
        let interruptions = 0;
        let wasBoth = false;
        for (const s of snaps) {
          const both = !!s.tutor?.isSpeaking && !!s.student?.isSpeaking;
          if (both && !wasBoth) interruptions++;
          wasBoth = both;
        }
        const durationMin = Math.max((snaps[snaps.length - 1].elapsed - snaps[0].elapsed) / 60000, 1 / 60);

        summaries.push({
          eyeContact: Math.round(tutorGazeSum / snaps.length),
          studentEyeContact: Math.round(studentGazeSum / snaps.length),
          talkTime: totalMs > 0 ? Math.round((tutorMs / totalMs) * 100) : 0,
          energy: Math.round(tutorEnergySum / snaps.length),
          studentEnergy: Math.round(studentEnergySum / snaps.length),
          interruptionsPerMin: Math.round((interruptions / durationMin) * 10) / 10,
        });
      } catch {
        // skip malformed session
      }
    }

    if (summaries.length === 0) {
      return res.json({ sessionCount: 0, trends: null });
    }

    // Average across all sessions
    const avg = (arr, key) => Math.round(arr.reduce((s, x) => s + x[key], 0) / arr.length);
    const trends = {
      eyeContact: avg(summaries, 'eyeContact'),
      studentEyeContact: avg(summaries, 'studentEyeContact'),
      talkTime: avg(summaries, 'talkTime'),
      energy: avg(summaries, 'energy'),
      studentEnergy: avg(summaries, 'studentEnergy'),
      interruptionsPerMin: Math.round(summaries.reduce((s, x) => s + x.interruptionsPerMin, 0) / summaries.length * 10) / 10,
    };

    res.json({ sessionCount: summaries.length, trends });
  } catch (err) {
    console.error('Get trends error:', err);
    res.status(500).json({ error: 'Failed to get trends' });
  }
});

// Get session history for the logged-in user
app.get('/api/sessions/history', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT session_code, tutor_id, student_id, merged, created_at, ended_at, tutor_metrics, student_metrics
       FROM sessions
       WHERE tutor_id = ? OR student_id = ?
       ORDER BY created_at DESC`,
      [req.user.id, req.user.id]
    );

    const sessions = rows.map(row => {
      // Extract start time and duration from stored metrics (client-side epoch timestamps)
      let startTime = null;
      let durationMs = 0;
      try {
        const tutor = row.tutor_metrics ? (typeof row.tutor_metrics === 'string' ? JSON.parse(row.tutor_metrics) : row.tutor_metrics) : null;
        const student = row.student_metrics ? (typeof row.student_metrics === 'string' ? JSON.parse(row.student_metrics) : row.student_metrics) : null;
        durationMs = Math.max(tutor?.duration || 0, student?.duration || 0);
        startTime = tutor?.startTime || student?.startTime || null;
      } catch { /* ignore parse errors */ }

      return {
        sessionCode: row.session_code,
        role: row.tutor_id === req.user.id ? 'tutor' : 'student',
        merged: row.merged,
        startedAt: startTime ? new Date(startTime).toISOString() : row.created_at,
        durationMs,
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

// Catch-all: serve React app for client-side routing
if (existsSync(clientDist)) {
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// --- Start ---
const PORT = process.env.PORT || 3001;

initDB()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket signaling on ws://localhost:${PORT}/ws`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
