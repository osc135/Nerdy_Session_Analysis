import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';

function getColor(value) {
  if (value === null || value === undefined) return '#2a2f3a';
  if (value < 40) return '#e06060';
  if (value < 70) return '#e8b45a';
  return '#6ee7a0';
}

function MetricGauge({ label, value, accentColor }) {
  const isNA = value === null || value === undefined;
  const fillColor = accentColor || getColor(value);
  const data = [{ value: isNA ? 0 : value }];

  return (
    <div style={styles.container}>
      <div style={styles.chartWrap}>
        <RadialBarChart
          width={80}
          height={80}
          cx={40}
          cy={40}
          innerRadius={28}
          outerRadius={38}
          startAngle={210}
          endAngle={-30}
          data={data}
          barSize={8}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={4}
            fill={isNA ? '#2a2f3a' : fillColor}
            background={{ fill: '#1e232d' }}
            angleAxisId={0}
            isAnimationActive={false}
          />
        </RadialBarChart>
        <div style={styles.valueOverlay}>
          <span style={{ ...styles.valueText, color: isNA ? '#4b5563' : fillColor }}>
            {isNA ? '—' : `${value}%`}
          </span>
        </div>
      </div>
      <span style={styles.label}>{label}</span>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  chartWrap: {
    position: 'relative',
    width: '80px',
    height: '80px',
  },
  valueOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  valueText: {
    fontSize: '0.78rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    marginTop: '4px',
  },
  label: {
    fontSize: '0.68rem',
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 1.2,
  },
};

export default MetricGauge;
