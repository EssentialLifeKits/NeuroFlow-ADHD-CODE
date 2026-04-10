/**
 * NeuroFlow — Schedule email reminder for a task
 * POST /api/schedule-reminder
 * Body: { title, dueDate, dueTime, category, userName, email, reminderOffset }
 *
 * Strategy:
 *  - Immediate sends (due within 6 min / past due): Gmail SMTP → guaranteed inbox
 *  - Future scheduled sends: Resend scheduled_at → exact time delivery
 *  - Every task also gets an instant Gmail confirmation so inbox trust is established
 */

const nodemailer   = require('nodemailer');
const GMAIL_USER   = process.env.GMAIL_USER ?? '';
const GMAIL_PASS   = process.env.GMAIL_APP_PASSWORD ?? '';
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const INSFORGE_URL   = process.env.INSFORGE_URL ?? process.env.EXPO_PUBLIC_INSFORGE_URL ?? '';
const INSFORGE_KEY   = process.env.INSFORGE_API_KEY ?? '';

function getGmailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
}

async function sendViaGmail({ to, subject, html }) {
  const transporter = getGmailTransporter();
  await transporter.sendMail({
    from: `NeuroFlow Reminders <${GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

async function markTaskSent(taskId) {
  if (!taskId || !INSFORGE_URL || !INSFORGE_KEY) return;
  try {
    const url = `${INSFORGE_URL}/api/database/records/tasks/${taskId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${INSFORGE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', recurrence_rule: 'sent' }),
    });
    if (!res.ok) console.error(`[schedule-reminder] markTaskSent failed ${res.status}: ${await res.text()}`);
    else console.log(`[schedule-reminder] Task ${taskId} marked as sent`);
  } catch (e) {
    console.error(`[schedule-reminder] markTaskSent error:`, e);
  }
}

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
<p style="margin:0 0 6px;font-size:11px;color:#4b5563;text-align:center;">Sent by NeuroFlow · ADHD Focus Planner &nbsp;·&nbsp;<span style="color:#4A90E2;">Built for your brain ✨</span></p>
<p style="margin:0;font-size:10px;color:#374151;text-align:center;">Add <span style="color:#4A90E2;">neuroflow.reminders@gmail.com</span> to your contacts to ensure all alerts reach your inbox.</p>
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

  if (!GMAIL_USER || !GMAIL_PASS) return res.status(500).json({ error: 'Missing GMAIL_USER or GMAIL_APP_PASSWORD' });

  const { title, dueDate, dueTime, category, userName, email, reminderOffset, timezone, taskId } = req.body ?? {};
  if (!title || !dueDate || !dueTime || !email) {
    return res.status(400).json({ error: 'Missing required fields: title, dueDate, dueTime, email' });
  }

  console.log('[schedule-reminder] Request:', { title, dueDate, dueTime, email, reminderOffset, timezone, taskId });

  const userTz = timezone || 'America/New_York';
  const naiveDt = new Date(`${dueDate}T${dueTime}:00`);
  const tzOffsetMs = getTimezoneOffsetMs(naiveDt, userTz);
  const eventDt = new Date(naiveDt.getTime() + tzOffsetMs);
  console.log('[schedule-reminder] Time conversion:', { naive: naiveDt.toISOString(), userTz, eventUTC: eventDt.toISOString() });

  const now = new Date();
  const FIVE_MIN_MS = 5 * 60 * 1000;
  // Tasks past their due time or within 1 minute: send immediately via Gmail
  const isPastDue = eventDt <= new Date(now.getTime() + 60_000);
  // Tasks 1–5 minutes away: too soon for Resend's minimum, send via Gmail immediately
  const isTooSoonForResend = !isPastDue && eventDt <= new Date(now.getTime() + FIVE_MIN_MS);
  const results = [];

  // ── Past due or within 1 minute → Gmail "It's time" ──────────────────────
  if (isPastDue) {
    try {
      await sendViaGmail({
        to: email,
        subject: `🎯 Now: ${title}`,
        html: buildEmailHtml({ title, dueDate, dueTime, category: category ?? 'task', userName: userName ?? '', type: 'at_time' }),
      });
      results.push({ type: 'at_time', scheduledAt: 'immediate', via: 'gmail' });
      if (taskId) await markTaskSent(taskId);
    } catch (e) {
      console.error('[schedule-reminder] Gmail send error:', e);
      results.push({ type: 'at_time', error: String(e), via: 'gmail' });
    }
  }

  // ── 1–5 minutes away → Gmail "Starting soon" (Resend minimum not met) ─────
  if (isTooSoonForResend) {
    const minsAway = Math.ceil((eventDt.getTime() - now.getTime()) / 60_000);
    try {
      await sendViaGmail({
        to: email,
        subject: `⏰ Starting in ${minsAway} min: ${title}`,
        html: buildEmailHtml({ title, dueDate, dueTime, category: category ?? 'task', userName: userName ?? '', type: 'reminder' }),
      });
      results.push({ type: 'reminder', scheduledAt: 'immediate', via: 'gmail' });
      if (taskId) await markTaskSent(taskId);
    } catch (e) {
      console.error('[schedule-reminder] Gmail soon-send error:', e);
      results.push({ type: 'reminder', error: String(e), via: 'gmail' });
    }
  }

  // ── 5+ minutes away → Resend at exact scheduled time ─────────────────────
  if (!isPastDue && !isTooSoonForResend && RESEND_API_KEY) {
    let offsetMs = 0;
    if (reminderOffset && reminderOffset !== 'at_time' && reminderOffset !== 'none') {
      const minMatch = reminderOffset.match(/^(\d+)min_before$/);
      if (minMatch) offsetMs = parseInt(minMatch[1], 10) * 60 * 1000;
      if (reminderOffset === '1h_before') offsetMs = 60 * 60 * 1000;
      if (reminderOffset === '1d_before') offsetMs = 24 * 60 * 60 * 1000;
    }

    const toSchedule = [];
    if (offsetMs > 0) toSchedule.push({ sendAt: new Date(eventDt.getTime() - offsetMs), type: 'reminder' });
    toSchedule.push({ sendAt: eventDt, type: 'at_time' });

    for (const { sendAt, type } of toSchedule) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `NeuroFlow ADHD <reminders@keepzbrandai.com>`,
          to: [email],
          subject: type === 'at_time' ? `🎯 Now: ${title}` : `⏰ Reminder: ${title}`,
          html: buildEmailHtml({ title, dueDate, dueTime, category: category ?? 'task', userName: userName ?? '', type }),
          scheduled_at: sendAt.toISOString(),
        }),
      });
      if (emailRes.ok) {
        const data = await emailRes.json();
        results.push({ type, scheduledAt: sendAt.toISOString(), id: data.id, via: 'resend' });
        if (type === 'at_time' && taskId) await markTaskSent(taskId);
      } else {
        const err = await emailRes.text();
        console.error(`[schedule-reminder] Resend error: ${emailRes.status} ${err}`);
        results.push({ type, error: err, status: emailRes.status, via: 'resend' });
      }
    }
  }

  const allFailed = results.length > 0 && results.every(r => r.error);
  if (allFailed) return res.status(502).json({ error: 'All email sends failed', scheduled: results });
  return res.status(200).json({ scheduled: results });
};
