import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { generateReport } from '../utils/reportGenerator';

function PostSessionReport() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    async function fetchReport() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/report`);
        if (!res.ok) throw new Error('Session not found');
        const session = await res.json();

        // If data isn't merged yet, retry a few times
        if (!session.tutor && retries < 5) {
          retries++;
          setTimeout(fetchReport, 2000);
          return;
        }

        if (!cancelled) {
          setReport(generateReport({ ...session, sessionId }));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchReport();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingBox}>
          <h2 style={styles.loadingText}>Generating Report...</h2>
          <p style={styles.loadingSub}>Crunching your session data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingBox}>
          <h2 style={styles.loadingText}>Report Unavailable</h2>
          <p style={styles.loadingSub}>{error}</p>
          <button style={styles.homeBtn} onClick={() => navigate('/')}>Back to Home</button>
        </div>
      </div>
    );
  }

  const { summary, keyMoments, nudgeLog, recommendations } = report;
  const scoreColor = summary.engagementScore >= 70 ? '#3fb950'
    : summary.engagementScore >= 40 ? '#d29922' : '#f85149';

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Session Report</h1>
            <p style={styles.subtitle}>Session {sessionId} — {report.durationMinutes} minutes</p>
          </div>
          <button style={styles.homeBtn} onClick={() => navigate('/')}>New Session</button>
        </div>

        {/* Summary Cards */}
        <div style={styles.cardGrid}>
          <SummaryCard
            label="Engagement Score"
            value={`${summary.engagementScore}`}
            unit="%"
            color={scoreColor}
            large
          />
          <SummaryCard
            label="Student Eye Contact"
            value={`${summary.eyeContact.student}`}
            unit="%"
            color="#3fb950"
          />
          <SummaryCard
            label="Student Energy"
            value={`${summary.energy.student}`}
            unit="%"
            color="#a371f7"
          />
          <SummaryCard
            label="Interruptions"
            value={`${summary.interruptions.total}`}
            unit={` (${summary.interruptions.perMinute}/min)`}
            color="#f0883e"
          />
        </div>

        {/* Talk Time Balance */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Talk Time Balance</h3>
          <div style={styles.card}>
            <div style={styles.balanceLabels}>
              <span style={styles.balanceLabel}>Tutor {summary.talkTime.tutor}%</span>
              <span style={styles.balanceLabel}>Student {summary.talkTime.student}%</span>
            </div>
            <div style={styles.balanceTrack}>
              <div style={{
                height: '100%',
                width: `${summary.talkTime.tutor}%`,
                background: '#f0883e',
                borderRadius: summary.talkTime.student === 0 ? '4px' : '4px 0 0 4px',
              }} />
              <div style={{
                height: '100%',
                width: `${summary.talkTime.student}%`,
                background: '#58a6ff',
                borderRadius: summary.talkTime.tutor === 0 ? '4px' : '0 4px 4px 0',
              }} />
            </div>
          </div>
        </div>

        {/* Key Moments */}
        {keyMoments.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Key Moments</h3>
            <div style={styles.card}>
              {keyMoments.map((moment, i) => (
                <div key={i} style={styles.momentRow}>
                  <span style={styles.momentTime}>{formatMs(moment.elapsed)}</span>
                  <span style={{
                    ...styles.momentBadge,
                    background: moment.type === 'attention_drop' ? '#f8514933' : '#d2992233',
                    color: moment.type === 'attention_drop' ? '#f85149' : '#d29922',
                  }}>
                    {moment.type === 'attention_drop' ? 'Attention Drop' : 'Silence'}
                  </span>
                  <span style={styles.momentDesc}>{moment.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nudge Log */}
        {nudgeLog.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Coaching Nudges ({nudgeLog.length})</h3>
            <div style={styles.card}>
              {nudgeLog.map((nudge, i) => (
                <div key={i} style={styles.nudgeRow}>
                  <span style={styles.nudgeTime}>{nudge.timestamp}</span>
                  <span style={styles.nudgeType}>{nudge.type.replace(/_/g, ' ')}</span>
                  <span style={styles.nudgeMsg}>{nudge.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Recommendations</h3>
            <div style={styles.card}>
              {recommendations.map((rec, i) => (
                <div key={i} style={styles.recRow}>
                  <span style={{
                    ...styles.recPriority,
                    color: rec.priority === 'high' ? '#f85149' : '#d29922',
                  }}>
                    {rec.priority}
                  </span>
                  <span style={styles.recText}>{rec.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No issues */}
        {recommendations.length === 0 && keyMoments.length === 0 && (
          <div style={styles.section}>
            <div style={{ ...styles.card, textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: '#3fb950', fontSize: '1.1rem', margin: 0 }}>
                Great session! No major issues detected.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, unit, color, large }) {
  return (
    <div style={{ ...styles.card, ...styles.summaryCard }}>
      <span style={styles.cardLabel}>{label}</span>
      <div style={styles.cardValueRow}>
        <span style={{
          ...styles.cardValue,
          color,
          fontSize: large ? '2.5rem' : '2rem',
        }}>
          {value}
        </span>
        <span style={{ ...styles.cardUnit, color }}>{unit}</span>
      </div>
    </div>
  );
}

function formatMs(ms) {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0d1117',
    color: '#c9d1d9',
    display: 'flex',
    justifyContent: 'center',
    padding: '2rem',
  },
  content: {
    maxWidth: '800px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  subtitle: {
    margin: '0.25rem 0 0',
    color: '#8b949e',
    fontSize: '0.9rem',
  },
  homeBtn: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  loadingBox: {
    textAlign: 'center',
    marginTop: '20vh',
  },
  loadingText: {
    fontSize: '1.3rem',
    margin: 0,
  },
  loadingSub: {
    color: '#8b949e',
    marginTop: '0.5rem',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '1rem',
  },
  card: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '8px',
    padding: '1rem',
  },
  summaryCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  cardLabel: {
    fontSize: '0.75rem',
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
  },
  cardValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '2px',
  },
  cardValue: {
    fontWeight: 700,
    lineHeight: 1,
  },
  cardUnit: {
    fontSize: '0.9rem',
    fontWeight: 600,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
  },
  balanceLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
  },
  balanceLabel: {
    fontSize: '0.85rem',
    color: '#8b949e',
  },
  balanceTrack: {
    display: 'flex',
    height: '10px',
    background: '#21262d',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  momentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0',
    borderBottom: '1px solid #21262d',
  },
  momentTime: {
    fontSize: '0.85rem',
    color: '#8b949e',
    fontVariantNumeric: 'tabular-nums',
    minWidth: '3rem',
  },
  momentBadge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  },
  momentDesc: {
    fontSize: '0.85rem',
    color: '#c9d1d9',
  },
  nudgeRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.6rem 0',
    borderBottom: '1px solid #21262d',
  },
  nudgeTime: {
    fontSize: '0.75rem',
    color: '#8b949e',
    fontVariantNumeric: 'tabular-nums',
  },
  nudgeType: {
    fontSize: '0.7rem',
    color: '#d29922',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  nudgeMsg: {
    fontSize: '0.85rem',
    color: '#c9d1d9',
  },
  recRow: {
    display: 'flex',
    gap: '0.75rem',
    padding: '0.6rem 0',
    borderBottom: '1px solid #21262d',
    alignItems: 'flex-start',
  },
  recPriority: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    minWidth: '3.5rem',
    paddingTop: '2px',
  },
  recText: {
    fontSize: '0.85rem',
    color: '#c9d1d9',
    lineHeight: 1.4,
  },
};

export default PostSessionReport;
