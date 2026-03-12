import jsPDF from 'jspdf';
import { SESSION_TYPE_BENCHMARKS } from './reportGenerator';

// Color palette matching the app's dark theme
const COLORS = {
  bg: [15, 17, 23],
  cardBg: [24, 28, 36],
  border: [37, 42, 51],
  text: [209, 213, 219],
  textDim: [107, 114, 128],
  textBright: [224, 228, 234],
  green: [110, 231, 160],
  yellow: [212, 160, 74],
  red: [240, 128, 128],
  orange: [232, 152, 90],
  blue: [122, 184, 224],
  purple: [167, 139, 222],
};

function getScoreColor(value) {
  if (value >= 70) return COLORS.green;
  if (value >= 40) return COLORS.yellow;
  return COLORS.red;
}

function getMetricColor(value) {
  if (value >= 70) return COLORS.green;
  if (value >= 40) return COLORS.yellow;
  return COLORS.red;
}

export function exportReportPDF(report) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  let y = margin;

  const { summary, keyMoments, nudgeLog, recommendations, hasStudent, sessionType, sessionId, durationFormatted } = report;
  const bench = SESSION_TYPE_BENCHMARKS[sessionType] || SESSION_TYPE_BENCHMARKS.lecture;

  // --- Helpers ---
  function setColor(rgb) {
    pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
  }

  function setFillColor(rgb) {
    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
  }

  function checkPage(needed) {
    if (y + needed > pageH - margin) {
      pdf.addPage();
      // Page background
      setFillColor(COLORS.bg);
      pdf.rect(0, 0, pageW, pageH, 'F');
      y = margin;
    }
  }

  function drawCard(x, cardY, w, h) {
    setFillColor(COLORS.cardBg);
    pdf.roundedRect(x, cardY, w, h, 2, 2, 'F');
  }

  function sectionTitle(text) {
    checkPage(14);
    setColor(COLORS.textBright);
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'bold');
    pdf.text(text, margin, y);
    y += 7;
  }

  // --- Page background ---
  setFillColor(COLORS.bg);
  pdf.rect(0, 0, pageW, pageH, 'F');

  // --- Header ---
  setColor(COLORS.textBright);
  pdf.setFontSize(18);
  pdf.setFont(undefined, 'bold');
  pdf.text('Session Report', margin, y);
  y += 7;

  setColor(COLORS.textDim);
  pdf.setFontSize(9);
  pdf.setFont(undefined, 'normal');
  pdf.text(`Session ${sessionId}  •  ${durationFormatted}  •  ${bench.label}`, margin, y);
  y += 12;

  // --- Engagement Score hero ---
  const heroH = 28;
  drawCard(margin, y, contentW, heroH);

  setColor(COLORS.textDim);
  pdf.setFontSize(7);
  pdf.setFont(undefined, 'bold');
  pdf.text('ENGAGEMENT SCORE', pageW / 2, y + 8, { align: 'center' });

  const scoreColor = getScoreColor(summary.engagementScore);
  setColor(scoreColor);
  pdf.setFontSize(28);
  pdf.setFont(undefined, 'bold');
  pdf.text(`${summary.engagementScore}%`, pageW / 2, y + 22, { align: 'center' });
  y += heroH + 8;

  // --- Gauge row helper ---
  function drawGaugeRow(gauges) {
    const gaugeW = contentW / gauges.length;
    const gaugeH = 22;
    checkPage(gaugeH + 4);
    drawCard(margin, y, contentW, gaugeH);

    gauges.forEach((g, i) => {
      const cx = margin + gaugeW * i + gaugeW / 2;
      const color = g.color || getMetricColor(g.value);

      // Value
      setColor(color);
      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text(`${g.value}%`, cx, y + 11, { align: 'center' });

      // Label
      setColor(COLORS.textDim);
      pdf.setFontSize(6.5);
      pdf.setFont(undefined, 'normal');
      pdf.text(g.label, cx, y + 17, { align: 'center' });
    });

    y += gaugeH + 6;
  }

  // --- Tutor Metrics ---
  sectionTitle('Tutor');
  const tutorGauges = [
    { label: 'Eye Contact', value: summary.eyeContact.tutor, color: COLORS.orange },
    { label: 'Talk Time', value: summary.talkTime.tutor, color: COLORS.orange },
    { label: 'Energy', value: summary.energy.tutor, color: COLORS.purple },
  ];
  if (hasStudent) tutorGauges.push({ label: 'Interruptions', value: summary.interruptions.tutorInitiated, color: COLORS.orange });
  drawGaugeRow(tutorGauges);

  // --- Student Metrics ---
  sectionTitle('Student');
  if (hasStudent) {
    const studentGauges = [
      { label: 'Eye Contact', value: summary.eyeContact.student, color: COLORS.green },
      { label: 'Talk Time', value: summary.talkTime.student, color: COLORS.blue },
      { label: 'Energy', value: summary.energy.student, color: COLORS.purple },
      { label: 'Interruptions', value: summary.interruptions.studentInitiated, color: COLORS.blue },
    ];
    drawGaugeRow(studentGauges);
  } else {
    checkPage(14);
    drawCard(margin, y, contentW, 10);
    setColor(COLORS.textDim);
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'italic');
    pdf.text('No student joined this session', margin + 6, y + 6.5);
    y += 16;
  }

  // --- Session Metrics ---
  if (hasStudent) {
    sectionTitle('Session');
    const sessionGauges = [
      { label: 'Mutual Attention', value: summary.mutualAttention.percent },
      { label: 'Interruptions/min', value: summary.interruptions.perMinute },
      { label: 'Attention Drift', value: summary.attentionDrift.average },
      { label: 'Duration', value: durationFormatted, color: COLORS.textDim },
    ];
    drawGaugeRow(sessionGauges);
  }

  // --- Talk Time Balance ---
  if (hasStudent) {
    sectionTitle('Talk Time Balance');
    const barH = 18;
    checkPage(barH + 4);
    drawCard(margin, y, contentW, barH);

    // Benchmark note
    setColor(COLORS.textDim);
    pdf.setFontSize(7);
    pdf.setFont(undefined, 'italic');
    pdf.text(`Target for ${bench.label}: ${bench.min}-${bench.max}% tutor`, margin + 6, y + 5.5);

    // Bar
    const barY = y + 9;
    const barX = margin + 6;
    const barW = contentW - 12;
    const barHeight = 4;

    setFillColor([30, 35, 45]);
    pdf.roundedRect(barX, barY, barW, barHeight, 1.5, 1.5, 'F');

    const tutorW = barW * (summary.talkTime.tutor / 100);
    setFillColor(COLORS.orange);
    pdf.roundedRect(barX, barY, Math.max(tutorW, 1), barHeight, 1.5, 1.5, 'F');

    // Labels
    setColor(COLORS.orange);
    pdf.setFontSize(7);
    pdf.setFont(undefined, 'bold');
    pdf.text(`Tutor ${summary.talkTime.tutor}%`, barX, barY + 8);

    setColor(COLORS.blue);
    pdf.text(`Student ${summary.talkTime.student}%`, barX + barW, barY + 8, { align: 'right' });

    y += barH + 6;
  }

  // --- Key Moments ---
  if (keyMoments.length > 0) {
    sectionTitle(`Key Moments (${keyMoments.length})`);

    for (const moment of keyMoments) {
      checkPage(10);
      const rowH = 7;
      drawCard(margin, y, contentW, rowH);

      // Time
      const totalSec = Math.round(moment.elapsed / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

      setColor(COLORS.textDim);
      pdf.setFontSize(7);
      pdf.setFont(undefined, 'normal');
      pdf.text(timeStr, margin + 4, y + 4.5);

      // Type badge
      const badgeColor = moment.type.includes('attention_drop') ? COLORS.red
        : moment.type === 'attention_drift' ? COLORS.yellow : COLORS.yellow;
      setColor(badgeColor);
      pdf.setFontSize(6);
      pdf.setFont(undefined, 'bold');
      const label = moment.type === 'attention_drop' ? 'STUDENT ATTENTION'
        : moment.type === 'tutor_attention_drop' ? 'TUTOR ATTENTION'
        : moment.type === 'attention_drift' ? 'ATTENTION DRIFT' : 'SILENCE';
      pdf.text(label, margin + 20, y + 4.5);

      // Description
      setColor(COLORS.text);
      pdf.setFontSize(7);
      pdf.setFont(undefined, 'normal');
      pdf.text(moment.description, margin + 55, y + 4.5);

      y += rowH + 1.5;
    }
    y += 4;
  }

  // --- Nudge Log ---
  if (nudgeLog.length > 0) {
    sectionTitle(`Coaching Nudges (${nudgeLog.length})`);

    for (const nudge of nudgeLog) {
      const lines = pdf.splitTextToSize(nudge.message, contentW - 16);
      const rowH = 7 + lines.length * 3.5;
      checkPage(rowH + 2);
      drawCard(margin, y, contentW, rowH);

      // Type
      setColor(COLORS.yellow);
      pdf.setFontSize(6);
      pdf.setFont(undefined, 'bold');
      pdf.text(nudge.type.replace(/_/g, ' ').toUpperCase(), margin + 4, y + 4.5);

      // Time
      setColor(COLORS.textDim);
      pdf.setFontSize(6);
      pdf.setFont(undefined, 'normal');
      pdf.text(nudge.timestamp || '', margin + contentW - 8, y + 4.5, { align: 'right' });

      // Message
      setColor(COLORS.text);
      pdf.setFontSize(7.5);
      pdf.setFont(undefined, 'normal');
      pdf.text(lines, margin + 4, y + 4.5 + 4);

      y += rowH + 1.5;
    }
    y += 4;
  }

  // --- Recommendations ---
  if (recommendations.length > 0) {
    sectionTitle('Recommendations');

    for (const rec of recommendations) {
      const lines = pdf.splitTextToSize(rec.text, contentW - 30);
      const rowH = 4 + lines.length * 3.5;
      checkPage(rowH + 2);
      drawCard(margin, y, contentW, rowH);

      // Priority
      const prioColor = rec.priority === 'high' ? COLORS.red : COLORS.yellow;
      setColor(prioColor);
      pdf.setFontSize(6);
      pdf.setFont(undefined, 'bold');
      pdf.text(rec.priority.toUpperCase(), margin + 4, y + 4);

      // Text
      setColor(COLORS.text);
      pdf.setFontSize(7.5);
      pdf.setFont(undefined, 'normal');
      pdf.text(lines, margin + 20, y + 4);

      y += rowH + 1.5;
    }
    y += 4;
  }

  // --- Footer ---
  checkPage(10);
  setColor(COLORS.textDim);
  pdf.setFontSize(6.5);
  pdf.setFont(undefined, 'normal');
  pdf.text('Generated by Nerdy Session Analysis', pageW / 2, y + 4, { align: 'center' });

  pdf.save(`session-report-${sessionId}.pdf`);
}
