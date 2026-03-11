import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyles.box}>
      <div style={tooltipStyles.time}>{formatElapsed(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontSize: '0.72rem' }}>
          {p.name}: {p.value != null ? `${p.value}%` : 'N/A'}
        </div>
      ))}
    </div>
  );
}

const tooltipStyles = {
  box: {
    background: '#1a1f28',
    border: '1px solid #2a2f3a',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '0.72rem',
  },
  time: {
    color: '#6b7280',
    marginBottom: '2px',
    fontSize: '0.68rem',
  },
};

const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: -20 };

function EyeContactTimeline({ data }) {
  return (
    <div style={styles.chartContainer}>
      <span style={styles.chartLabel}>Eye Contact</span>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e232d" />
          <XAxis
            dataKey="elapsed"
            tickFormatter={formatElapsed}
            tick={{ fontSize: 10, fill: '#4b5563' }}
            interval="preserveStartEnd"
            stroke="#1e232d"
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#4b5563' }} stroke="#1e232d" />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="tutorEye" name="Tutor" stroke="#e8985a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="studentEye" name="Student" stroke="#6ee7a0" strokeWidth={1.5} dot={false} strokeDasharray={data.length > 0 && data[data.length - 1].studentEye == null ? '4 3' : undefined} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TalkTimeTimeline({ data }) {
  return (
    <div style={styles.chartContainer}>
      <span style={styles.chartLabel}>Talk Time</span>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e232d" />
          <XAxis
            dataKey="elapsed"
            tickFormatter={formatElapsed}
            tick={{ fontSize: 10, fill: '#4b5563' }}
            interval="preserveStartEnd"
            stroke="#1e232d"
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#4b5563' }} stroke="#1e232d" />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="tutorTalk" name="Tutor" stroke="#e8985a" fill="#e8985a" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
          <Area type="monotone" dataKey="studentTalk" name="Student" stroke="#7ab8e0" fill="#7ab8e0" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EnergyTimeline({ data }) {
  return (
    <div style={styles.chartContainer}>
      <span style={styles.chartLabel}>Energy</span>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e232d" />
          <XAxis
            dataKey="elapsed"
            tickFormatter={formatElapsed}
            tick={{ fontSize: 10, fill: '#4b5563' }}
            interval="preserveStartEnd"
            stroke="#1e232d"
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#4b5563' }} stroke="#1e232d" />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="tutorEnergy" name="Tutor" stroke="#c4a5e0" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="studentEnergy" name="Student" stroke="#a78bde" strokeWidth={1.5} dot={false} strokeDasharray={data.length > 0 && data[data.length - 1].studentEnergy == null ? '4 3' : undefined} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AttentionDriftTimeline({ data }) {
  return (
    <div style={styles.chartContainer}>
      <span style={styles.chartLabel}>Attention Drift</span>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e232d" />
          <XAxis
            dataKey="elapsed"
            tickFormatter={formatElapsed}
            tick={{ fontSize: 10, fill: '#4b5563' }}
            interval="preserveStartEnd"
            stroke="#1e232d"
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#4b5563' }} stroke="#1e232d" />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="drift" name="Drift" stroke="#d4a04a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TimelineChart({ data }) {
  const hasDrift = data.some(d => d.drift != null);
  return (
    <div style={styles.wrapper}>
      <EyeContactTimeline data={data} />
      <TalkTimeTimeline data={data} />
      <EnergyTimeline data={data} />
      {hasDrift && <AttentionDriftTimeline data={data} />}
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  chartContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  chartLabel: {
    fontSize: '0.68rem',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  },
};

export default TimelineChart;
