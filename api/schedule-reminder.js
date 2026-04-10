/**
 * NeuroFlow — Schedule a Resend email reminder for a task
 * POST /api/schedule-reminder
 * Body: { title, dueDate, dueTime, category, userName, email, reminderOffset }
 *   reminderOffset: 'at_time' | '1h_before' | '1d_before' | 'none'
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM_EMAIL     = process.env.FROM_EMAIL ?? 'NeuroFlow <noreply@keepzbrandai.com>';

const CATEGORY_META = {
  task:        { color: '#FEDA75', emoji: '✅', label: 'Task' },
  appointment: { color: '#34D399', emoji: '📅', label: 'Appointment' },
  selfcare:    { color: '#F87171', emoji: '💆', label: 'Self-Care' },
  'self-care': { color: '#F87171', emoji: '💆', label: 'Self-Care' },
  routine:     { color: '#4A90E2', emoji: '🔄', label: 'Routine' },
  deadline:    { color: '#FB923C', emoji: '⏰', label: 'Deadline' },
};

function buildEmailHtml({ title, dueDate, dueTime, category, userName, type }) {
  const cat = CATEGORY_META[category?.toLowerCase()] ?? CATEGORY_META['task'];
  const isReminder = type === 'reminder';
  const formattedDate = new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const [h, m] = dueTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const formattedTime = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  const headline = isReminder ? `⏰ Reminder: <strong>${title}</strong>` : `🎯 It's time: <strong>${title}</strong>`;
  const subline  = isReminder ? `Your scheduled task is coming up soon.` : `Your scheduled task is happening now.`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>NeuroFlow Reminder</title></head>
<body style="margin:0;padding:0;background:#0e0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e1a;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#15152a;border-radius:20px;border:1px solid #2a2a3e;overflow:hidden;max-width:560px;width:100%;">
<tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px 32px;border-bottom:1px solid #2a2a3e;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><span style="font-size:22px;font-weight:800;color:#4A90E2;">NeuroFlow</span><span style="font-size:13px;color:#6b7280;margin-left:8px;">Focus Planner</span></td>
<td align="right"><span style="background:${cat.color}22;border:1px solid ${cat.color}55;color:${cat.color};font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;">${cat.emoji} ${cat.label.toUpperCase()}</span></td>
</tr></table></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 8px;font-size:14px;color:#9ca3af;">Hi ${userName || 'there'} 👋</p>
<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#f0f0f5;">${headline}</h1>
<p style="margin:0 0 28px;font-size:14px;color:#9ca3af;">${subline}</p>
<div style="background:#1e1e35;border:1px solid ${cat.color}44;border-left:4px solid ${cat.color};border-radius:12px;padding:20px 24px;margin-bottom:28px;">
<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#f0f0f5;">${cat.emoji} ${title}</p>
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:24px;"><p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">DATE</p><p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#e5e7eb;">📅 ${formattedDate}</p></td>
<td><p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">TIME</p><p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#e5e7eb;">🕐 ${formattedTime}</p></td>
</tr></table></div>
<p style="margin:0 0 24px;font-size:13px;color:#9ca3af;line-height:1.6;">${isReminder ? 'Head to your NeuroFlow planner to review your task.' : "Open NeuroFlow and stay in your flow state. You've got this! 🌸"}</p>
</td></tr>
<tr><td style="background:#0e0e1a;padding:20px 32px;border-top:1px solid #2a2a3e;">
<p style="margin:0;font-size:11px;color:#4b5563;text-align:center;">Sent by NeuroFlow · ADHD Focus Planner &nbsp;·&nbsp;<span style="color:#4A90E2;">Built for your brain ✨</span></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Compute the offset in ms to convert a "naive" local time to UTC.
 * Uses Intl.DateTimeFormat — built-in to Node 18+.
 */
function getTimezoneOffsetMs(naiveUtcDate, timezone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = {};
    for (const p of fmt.formatToParts(naiveUtcDate)) parts[p.type] = p.value;
    const localAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    return naiveUtcDate.getTime() - localAsUtc.getTime();
  } catch (e) {
    console.warn(`[schedule-reminder] TZ conversion failed for ${timezone}:`, e);
    return 4 * 60 * 60 * 1000; // default EST/EDT offset
  }
}

module.exports = async function handler(req, res) {
  // Allow CORS from the app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Missing RESEND_API_KEY' });

  const { title, dueDate, dueTime, category, userName, email, reminderOffset, timezone } = req.body ?? {};
  if (!title || !dueDate || !dueTime || !email) {
    return res.status(400).json({ error: 'Missing required fields: title, dueDate, dueTime, email' });
  }

  console.log('[schedule-reminder] Request:', { title, dueDate, dueTime, email, reminderOffset, timezone });

  // Calculate the scheduled send time based on reminderOffset
  // The client sends times in the user's local timezone, so we need to convert to UTC
  const userTz = timezone || 'America/New_York';
  const naiveDt = new Date(`${dueDate}T${dueTime}:00`);
  const tzOffsetMs = getTimezoneOffsetMs(naiveDt, userTz);
  const eventDt = new Date(naiveDt.getTime() + tzOffsetMs);
  console.log('[schedule-reminder] Time conversion:', { naive: naiveDt.toISOString(), userTz, eventUTC: eventDt.toISOString() });
  const scheduled = [];

  if (!reminderOffset || reminderOffset === 'at_time' || reminderOffset === 'none') {
    // No advance reminder — send at the exact due time only
    scheduled.push({ sendAt: eventDt, type: 'at_time' });
  } else {
    // Parse new format "30min_before", "60min_before" etc. + legacy "1h_before" / "1d_before"
    let offsetMs = 0;
    const minMatch = reminderOffset.match(/^(\d+)min_before$/);
    if (minMatch) offsetMs = parseInt(minMatch[1], 10) * 60 * 1000;
    if (reminderOffset === '1h_before') offsetMs = 60 * 60 * 1000;
    if (reminderOffset === '1d_before') offsetMs = 24 * 60 * 60 * 1000;

    if (offsetMs > 0) {
      scheduled.push({ sendAt: new Date(eventDt.getTime() - offsetMs), type: 'reminder' });
    }
    scheduled.push({ sendAt: eventDt, type: 'at_time' });
  }

  const results = [];
  for (const { sendAt, type } of scheduled) {
    const now = new Date();
    // Tasks due in the past or within 60 seconds: send immediately (no scheduled_at).
    // Resend requires scheduled_at to be at least ~60s in the future; past times are rejected.
    const isPast = sendAt <= new Date(now.getTime() + 60_000);

    const emailBody = {
      from: FROM_EMAIL,
      to: [email],
      subject: type === 'at_time' ? `🎯 Now: ${title}` : `⏰ Reminder: ${title}`,
      html: buildEmailHtml({ title, dueDate, dueTime, category: category ?? 'task', userName: userName ?? '', type }),
    };
    if (!isPast) {
      emailBody.scheduled_at = sendAt.toISOString();
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody),
    });

    if (emailRes.ok) {
      const data = await emailRes.json();
      results.push({ type, scheduledAt: isPast ? 'immediate' : sendAt.toISOString(), id: data.id });
    } else {
      const err = await emailRes.text();
      console.error(`[schedule-reminder] Resend error: ${emailRes.status} ${err}`);
      results.push({ type, error: err, status: emailRes.status });
    }
  }

  return res.status(200).json({ scheduled: results });
};
