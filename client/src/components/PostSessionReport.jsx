import { useState, useEffect, useMemo, useCallback, Component } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { generateReport, SESSION_TYPE_BENCHMARKS } from '../utils/reportGenerator';
import { exportReportPDF } from '../utils/pdfExport';
import MetricGauge from './MetricGauge';
import TimelineChart from './TimelineChart';

class ReportErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Report render error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: '#f08080', textAlign: 'center', marginTop: '20vh' }}>
          <h2>Report failed to render</h2>
          <pre style={{ color: '#9ca3af', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function PostSessionReport() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const handleDownloadPDF = useCallback(() => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      exportReportPDF(report);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [report, exporting]);

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    async function fetchReport() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/report`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Session not found');
        const session = await res.json();

        // If data isn't merged yet, retry a few times
        if (!session.tutor && retries < 5) {
          retries++;
          setTimeout(fetchReport, 2000);
          return;
        }

        if (!cancelled) {
          try {
            setReport(generateReport({ ...session, sessionId }));
          } catch (genErr) {
            console.error('generateReport crashed:', genErr);
            setError(`Report generation failed: ${genErr.message}`);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Report fetch failed:', err);
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchReport();
    return () => { cancelled = true; };
  }, [sessionId]);

  // useMemo must run on every render (Rules of Hooks — no hooks after early returns)
  const snapshots = report?.snapshots;
  const timelineData = useMemo(() => {
    if (!snapshots?.length) return [];
    return snapshots.map(s => ({
      elapsed: Math.round((s.elapsed || 0) / 1000),
      tutorEye: Math.round(s.tutor?.gazeScore ?? 0),
      studentEye: s.student?.gazeScore != null ? Math.round(s.student.gazeScore) : null,
      tutorTalk: Math.round(s.tutor?.talkTimePercent ?? 0),
      studentTalk: s.student?.talkTimePercent != null ? Math.round(s.student.talkTimePercent) : null,
      tutorEnergy: Math.round((s.tutor?.energy ?? 0) * 100),
      studentEnergy: s.student?.energy != null ? Math.round(s.student.energy * 100) : null,
      drift: s.tutor?.attentionDrift ?? null,
    }));
  }, [snapshots]);

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

  const { summary, keyMoments, nudgeLog, recommendations, hasStudent, sessionType } = report;
  const bench = SESSION_TYPE_BENCHMARKS[sessionType] || SESSION_TYPE_BENCHMARKS.lecture;
  const scoreColor = summary.engagementScore >= 70 ? '#6ee7a0'
    : summary.engagementScore >= 40 ? '#d4a04a' : '#f08080';

  return (
    <ReportErrorBoundary>
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Session Report</h1>
            <p style={styles.subtitle}>Session {sessionId} — {report.durationFormatted} — {bench.label}</p>
          </div>
          <div style={styles.headerActions}>
            <button style={styles.downloadBtn} onClick={handleDownloadPDF} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Download PDF'}
            </button>
            <button style={styles.homeBtn} onClick={() => navigate('/')}>New Session</button>
          </div>
        </div>

        {/* Engagement Score — hero card */}
        <div style={styles.heroCard}>
          <span style={styles.heroLabel}>Engagement Score</span>
          <div style={styles.heroValueRow}>
            <span style={{ ...styles.heroValue, color: scoreColor }}>{summary.engagementScore}</span>
            <span style={{ ...styles.heroUnit, color: scoreColor }}>%</span>
          </div>
        </div>

        {/* Tutor Metrics */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Tutor</h3>
          <div style={styles.card}>
            <div style={styles.gaugeRow}>
              <MetricGauge label="Eye Contact" value={summary.eyeContact.tutor} accentColor="#e8985a" />
              <MetricGauge label="Talk Time" value={summary.talkTime.tutor} accentColor="#e8985a" />
              <MetricGauge label="Energy" value={summary.energy.tutor} accentColor="#c4a5e0" />
            </div>
          </div>
        </div>

        {/* Student Metrics */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Student</h3>
          {hasStudent ? (
            <div style={styles.card}>
              <div style={styles.gaugeRow}>
                <MetricGauge label="Eye Contact" value={summary.eyeContact.student} accentColor="#6ee7a0" />
                <MetricGauge label="Talk Time" value={summary.talkTime.student} accentColor="#7ab8e0" />
                <MetricGauge label="Energy" value={summary.energy.student} accentColor="#a78bde" />
              </div>
            </div>
          ) : (
            <div style={styles.card}>
              <p style={styles.naText}>No student joined this session</p>
            </div>
          )}
        </div>

        {/* Session Metrics */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Session</h3>
          <div style={styles.cardGrid}>
            {hasStudent && <MetricCard
              label="Mutual Attention"
              value={summary.mutualAttention.percent}
              unit="%"
              color="#6ee7a0"
            />}
            {hasStudent && <MetricCard
              label="Interruptions"
              value={summary.interruptions.total}
              unit={` total (${summary.interruptions.perMinute}/min)`}
              color="#d4a04a"
            />}
            {hasStudent && <MetricCard
              label="Tutor Interrupted"
              value={summary.interruptions.tutorInitiated}
              unit=" times"
              color="#e8985a"
            />}
            {hasStudent && <MetricCard
              label="Student Interrupted"
              value={summary.interruptions.studentInitiated}
              unit=" times"
              color="#7ab8e0"
            />}
            {hasStudent && <MetricCard
              label="Attention Drift"
              value={summary.attentionDrift.average}
              unit="%"
              color={summary.attentionDrift.average < 40 ? '#6ee7a0' : summary.attentionDrift.average < 65 ? '#d4a04a' : '#f08080'}
            />}
            <MetricCard
              label="Duration"
              value={report.durationFormatted}
              unit=""
              color="#9ca3af"
            />
          </div>
        </div>

        {/* Talk Time Balance */}
        {hasStudent && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Talk Time Balance</h3>
            <div style={styles.card}>
              <div style={styles.benchmarkNote}>
                Target for {bench.label}: {bench.min}-{bench.max}% tutor
              </div>
              <TalkTimeDonut
                tutor={summary.talkTime.tutor}
                student={summary.talkTime.student}
                benchMin={bench.min}
                benchMax={bench.max}
              />
            </div>
          </div>
        )}

        {/* Session Timeline */}
        {timelineData.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Session Timeline</h3>
            <div style={styles.card}>
              <TimelineChart data={timelineData} />
            </div>
          </div>
        )}

        {/* Key Moments */}
        {keyMoments.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Key Moments</h3>
            <div style={styles.card}>
              {keyMoments.map((moment, i) => (
                <div key={i} style={{
                  ...styles.momentRow,
                  borderBottom: i < keyMoments.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
                  <span style={styles.momentTime}>{formatMs(moment.elapsed)}</span>
                  <span style={{
                    ...styles.momentBadge,
                    ...momentBadgeStyles[moment.type] || momentBadgeStyles._default,
                  }}>
                    {momentLabels[moment.type] || 'Unknown'}
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
                <div key={i} style={{
                  ...styles.nudgeRow,
                  borderBottom: i < nudgeLog.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
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
                <div key={i} style={{
                  ...styles.recRow,
                  borderBottom: i < recommendations.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
                  <span style={{
                    ...styles.recPriority,
                    color: rec.priority === 'high' ? '#f08080' : '#d4a04a',
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
              <p style={{ color: '#6ee7a0', fontSize: '1rem', margin: 0 }}>
                Great session! No major issues detected.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </ReportErrorBoundary>
  );
}

function MetricCard({ label, value, unit, color }) {
  return (
    <div style={{ ...styles.card, ...styles.metricCard }}>
      <span style={styles.cardLabel}>{label}</span>
      <div style={styles.cardValueRow}>
        <span style={{ ...styles.cardValue, color }}>{value}</span>
        <span style={{ ...styles.cardUnit, color }}>{unit}</span>
      </div>
    </div>
  );
}

function TalkTimeDonut({ tutor, student, benchMin, benchMax }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 68;
  const stroke = 10;

  const tutorAngle = (tutor / 100) * 360;
  const studentAngle = (student / 100) * 360;
  const benchMinAngle = (benchMin / 100) * 360;
  const benchMaxAngle = (benchMax / 100) * 360;

  // Circumference for stroke-dasharray based arcs
  const circ = 2 * Math.PI * radius;

  function dashArc(startDeg, spanDeg) {
    const len = (spanDeg / 360) * circ;
    const offset = -(startDeg / 360) * circ;
    return { strokeDasharray: `${len} ${circ - len}`, strokeDashoffset: offset };
  }

  const inRange = tutor >= benchMin && tutor <= benchMax;
  const statusLabel = inRange ? 'On target' : tutor > benchMax ? 'Over target' : 'Under target';
  const statusColor = inRange ? '#6ee7a0' : tutor > benchMax ? '#f08080' : '#d4a04a';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background track */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          {/* Tutor arc */}
          {tutor > 0 && (
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e8985a" strokeWidth={stroke}
              {...dashArc(0, tutorAngle)} />
          )}
          {/* Student arc */}
          {student > 0 && (
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#7ab8e0" strokeWidth={stroke}
              {...dashArc(tutorAngle, studentAngle)} />
          )}
        </svg>
        {/* Center text overlay */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: statusColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{tutor}%</span>
          <span style={{ fontSize: '0.68rem', color: statusColor, fontWeight: 600, marginTop: '2px' }}>{statusLabel}</span>
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.78rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#e8985a' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e8985a', flexShrink: 0 }} />
          Tutor {tutor}%
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#7ab8e0' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7ab8e0', flexShrink: 0 }} />
          Student {student}%
        </span>
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

const momentLabels = {
  attention_drop: 'Student Attention',
  tutor_attention_drop: 'Tutor Attention',
  attention_drift: 'Attention Drift',
  long_silence: 'Silence',
};

const momentBadgeStyles = {
  attention_drop: { background: '#f0808022', color: '#f08080' },
  tutor_attention_drop: { background: '#f0808022', color: '#f08080' },
  attention_drift: { background: '#d4a04a22', color: '#d4a04a' },
  long_silence: { background: '#d4a04a22', color: '#d4a04a' },
  _default: { background: '#d4a04a22', color: '#d4a04a' },
};

const styles = {
  container: {
    minHeight: '100vh',
    color: '#d1d5db',
    display: 'flex',
    justifyContent: 'center',
    padding: '2rem',
  },
  content: {
    maxWidth: '820px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    paddingBottom: '3rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    margin: 0,
    fontSize: '1.4rem',
    fontWeight: 600,
    color: '#e0e4ea',
  },
  subtitle: {
    margin: '0.25rem 0 0',
    color: '#6b7280',
    fontSize: '0.88rem',
  },
  headerActions: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  downloadBtn: {
    background: '#17E2EA',
    color: '#0F0928',
    border: 'none',
    borderRadius: '60px',
    padding: '0.5rem 1.25rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
    boxShadow: '0 4px 16px #17E2EA33',
  },
  homeBtn: {
    background: 'rgba(255,255,255,0.05)',
    color: '#9ca3af',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '60px',
    padding: '0.5rem 1.25rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },
  loadingBox: {
    textAlign: 'center',
    marginTop: '20vh',
  },
  loadingText: {
    fontSize: '1.2rem',
    margin: 0,
    color: '#e0e4ea',
  },
  loadingSub: {
    color: '#6b7280',
    marginTop: '0.5rem',
  },
  heroCard: {
    background: 'rgba(22,28,44,0.7)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '20px',
    padding: '1.75rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    backdropFilter: 'blur(20px)',
  },
  heroLabel: {
    fontSize: '0.7rem',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
  },
  heroValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '2px',
  },
  heroValue: {
    fontSize: '3rem',
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  heroUnit: {
    fontSize: '1.2rem',
    fontWeight: 600,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e0e4ea',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '0.75rem',
  },
  card: {
    background: 'rgba(22,28,44,0.7)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '16px',
    padding: '1rem',
    backdropFilter: 'blur(20px)',
  },
  metricCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  gaugeRow: {
    display: 'flex',
    justifyContent: 'space-around',
    gap: '0.5rem',
    padding: '0.5rem 0',
  },
  cardLabel: {
    fontSize: '0.7rem',
    color: '#6b7280',
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
    fontSize: '1.8rem',
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  cardUnit: {
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  benchmarkNote: {
    fontSize: '0.78rem',
    color: '#6b7280',
    marginBottom: '0.5rem',
    fontStyle: 'italic',
  },
  balanceLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
  },
  balanceLabelLeft: {
    fontSize: '0.82rem',
    color: '#e8985a',
  },
  balanceLabelRight: {
    fontSize: '0.82rem',
    color: '#7ab8e0',
  },
  balanceTrack: {
    display: 'flex',
    height: '8px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  momentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 0',
  },
  momentTime: {
    fontSize: '0.82rem',
    color: '#6b7280',
    fontVariantNumeric: 'tabular-nums',
    minWidth: '3rem',
  },
  momentBadge: {
    fontSize: '0.68rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: '5px',
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  },
  momentDesc: {
    fontSize: '0.85rem',
    color: '#9ca3af',
  },
  nudgeRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.65rem 0',
  },
  nudgeTime: {
    fontSize: '0.72rem',
    color: '#6b7280',
    fontVariantNumeric: 'tabular-nums',
  },
  nudgeType: {
    fontSize: '0.68rem',
    color: '#d4a04a',
    textTransform: 'uppercase',
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  nudgeMsg: {
    fontSize: '0.85rem',
    color: '#9ca3af',
    lineHeight: 1.45,
  },
  recRow: {
    display: 'flex',
    gap: '0.75rem',
    padding: '0.65rem 0',
    alignItems: 'flex-start',
  },
  recPriority: {
    fontSize: '0.68rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    minWidth: '3.5rem',
    paddingTop: '2px',
    letterSpacing: '0.03em',
  },
  recText: {
    fontSize: '0.85rem',
    color: '#9ca3af',
    lineHeight: 1.45,
  },
  naText: {
    margin: 0,
    color: '#4b5563',
    fontSize: '0.88rem',
    fontStyle: 'italic',
  },
};

export default PostSessionReport;
