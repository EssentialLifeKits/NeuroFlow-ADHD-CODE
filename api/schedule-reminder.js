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
const SUPABASE_URL    = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const NEUROFLOW_LOGO_URL = process.env.NEUROFLOW_LOGO_URL
  ?? 'https://neuro-flow-adhd-code-i9is.vercel.app/remotion/neuroflow-promo/logo.png';

function getGmailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
}

async function sendViaGmail({ to, subject, html, attachments = [] }) {
  const transporter = getGmailTransporter();
  await transporter.sendMail({
    from: `NeuroFlow Reminders <${GMAIL_USER}>`,
    to,
    subject,
    html,
    attachments,
  });
}

async function markTaskSent(taskId) {
  if (!taskId || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/tasks?id=eq.${taskId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHex(value, fallback) {
  const color = String(value ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  return fallback;
}

function applyTemplate(template, replacements) {
  return String(template ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? '');
}

const EMAIL_TEXT_DEFAULTS = {
  brandName: 'NeuroFlow',
  productName: 'Focus Planner',
  badgeEmoji: '⏰',
  badgeText: 'DEADLINE',
  greetingTemplate: 'Hi {{name}}',
  greetingEmoji: '👋',
  atTimeHeadlineEmoji: '🎯',
  atTimeHeadlineTemplate: "It's time: {{title}}",
  reminderHeadlineEmoji: '⏰',
  reminderHeadlineTemplate: 'Reminder: {{title}}',
  atTimeSubline: 'Your scheduled task is happening now.',
  reminderSubline: 'Your scheduled task is coming up soon.',
  cardEmoji: '⏰',
  dateLabel: 'DATE',
  dateEmoji: '📅',
  timeLabel: 'TIME',
  timeEmoji: '🕐',
  atTimeBody: "Open NeuroFlow and stay in your flow state. You've got this! 🌸",
  reminderBody: 'Head to your NeuroFlow planner to review your task.',
  contactLine: 'Add neuroflow.reminders@gmail.com to your contacts to ensure all alerts reach your inbox.',
};

async function getEmailSettings() {
  const defaults = {
    subjectTask: '🎯 Now: {{title}}',
    subjectReminder: '⏰ Reminder: {{title}}',
    headerColor: '#4A90E2',
    accentColor: '#4A90E2',
    footerText: 'Sent by NeuroFlow · ADHD Focus Planner · Built for your brain ✨',
    ...EMAIL_TEXT_DEFAULTS,
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return defaults;
  try {
    const settingKeys = [
      'email_subject_task',
      'email_subject_reminder',
      'email_header_color',
      'email_accent_color',
      'email_footer_text',
      'email_brand_name',
      'email_product_name',
      'email_badge_emoji',
      'email_badge_text',
      'email_greeting_template',
      'email_greeting_emoji',
      'email_at_time_headline_emoji',
      'email_at_time_headline_template',
      'email_reminder_headline_emoji',
      'email_reminder_headline_template',
      'email_at_time_subline',
      'email_reminder_subline',
      'email_card_emoji',
      'email_date_label',
      'email_date_emoji',
      'email_time_label',
      'email_time_emoji',
      'email_at_time_body',
      'email_reminder_body',
      'email_contact_line',
    ];
    const url = `${SUPABASE_URL}/rest/v1/app_settings?select=key,value&key=in.(${settingKeys.join(',')})`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
      },
    });
    if (!res.ok) return defaults;
    const rows = await res.json();
    const map = Object.fromEntries((rows ?? []).map(row => [row.key, row.value]));
    return {
      subjectTask: map.email_subject_task || defaults.subjectTask,
      subjectReminder: map.email_subject_reminder || defaults.subjectReminder,
      headerColor: normalizeHex(map.email_header_color, defaults.headerColor),
      accentColor: normalizeHex(map.email_accent_color, defaults.accentColor),
      footerText: map.email_footer_text || defaults.footerText,
      brandName: map.email_brand_name || defaults.brandName,
      productName: map.email_product_name || defaults.productName,
      badgeEmoji: map.email_badge_emoji || defaults.badgeEmoji,
      badgeText: map.email_badge_text || defaults.badgeText,
      greetingTemplate: map.email_greeting_template || defaults.greetingTemplate,
      greetingEmoji: map.email_greeting_emoji || defaults.greetingEmoji,
      atTimeHeadlineEmoji: map.email_at_time_headline_emoji || defaults.atTimeHeadlineEmoji,
      atTimeHeadlineTemplate: map.email_at_time_headline_template || defaults.atTimeHeadlineTemplate,
      reminderHeadlineEmoji: map.email_reminder_headline_emoji || defaults.reminderHeadlineEmoji,
      reminderHeadlineTemplate: map.email_reminder_headline_template || defaults.reminderHeadlineTemplate,
      atTimeSubline: map.email_at_time_subline || defaults.atTimeSubline,
      reminderSubline: map.email_reminder_subline || defaults.reminderSubline,
      cardEmoji: map.email_card_emoji || defaults.cardEmoji,
      dateLabel: map.email_date_label || defaults.dateLabel,
      dateEmoji: map.email_date_emoji || defaults.dateEmoji,
      timeLabel: map.email_time_label || defaults.timeLabel,
      timeEmoji: map.email_time_emoji || defaults.timeEmoji,
      atTimeBody: map.email_at_time_body || defaults.atTimeBody,
      reminderBody: map.email_reminder_body || defaults.reminderBody,
      contactLine: map.email_contact_line || defaults.contactLine,
    };
  } catch (e) {
    console.warn('[schedule-reminder] email settings fallback:', e);
    return defaults;
  }
}

function parseInlineThumbnail(thumbnail) {
  if (!thumbnail || typeof thumbnail !== 'string') return null;
  const match = thumbnail.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const contentType = match[1];
  const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  return {
    cid: 'task-thumbnail',
    contentType,
    filename: `task-thumbnail.${extension}`,
    content: match[2],
  };
}

async function uploadInlineThumbnail(thumbnail) {
  const inline = parseInlineThumbnail(thumbnail);
  if (!inline || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;

  const path = `email-thumbnails/${Date.now()}-${Math.random().toString(36).slice(2)}-${inline.filename}`;
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/resource-assets/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Content-Type': inline.contentType,
      'x-upsert': 'true',
    },
    body: Buffer.from(inline.content, 'base64'),
  });

  if (!uploadRes.ok) {
    console.warn('[schedule-reminder] Thumbnail upload failed:', uploadRes.status, await uploadRes.text().catch(() => ''));
    return null;
  }

  return `${SUPABASE_URL}/storage/v1/object/public/resource-assets/${path}`;
}

function buildThumbnailAttachments(thumbnail) {
  const inline = parseInlineThumbnail(thumbnail);
  if (!inline) return { gmail: [], resend: [] };
  return {
    gmail: [{
      filename: inline.filename,
      content: Buffer.from(inline.content, 'base64'),
      contentType: inline.contentType,
      cid: inline.cid,
    }],
    resend: [{
      filename: inline.filename,
      content: inline.content,
      content_type: inline.contentType,
      content_id: inline.cid,
    }],
  };
}

async function prepareThumbnailForEmail(thumbnail) {
  const inline = parseInlineThumbnail(thumbnail);
  if (!inline) return { thumbnail, gmail: [], resend: [] };

  try {
    const publicUrl = await uploadInlineThumbnail(thumbnail);
    if (publicUrl) return { thumbnail: publicUrl, gmail: [], resend: [] };
  } catch (e) {
    console.warn('[schedule-reminder] Thumbnail public upload fallback failed:', e?.message ?? e);
  }

  const attachments = buildThumbnailAttachments(thumbnail);
  return { thumbnail: `cid:${inline.cid}`, ...attachments };
}

function buildThumbnailHtml(thumbnail, accentColor) {
  if (!thumbnail || typeof thumbnail !== 'string') return '';
  const src = thumbnail.startsWith('https://') || thumbnail.startsWith('cid:') ? thumbnail : '';
  if (!src) return '';

  return `<td width="238" valign="middle" align="right" style="padding-left:24px;">
    <div style="width:220px;height:156px;border:4px solid ${accentColor};border-radius:14px;overflow:hidden;background:#0e0e1a;text-align:center;line-height:156px;">
      <img src="${src}" alt="Task thumbnail" width="220" height="156" style="display:block;width:220px;height:156px;object-fit:cover;object-position:center center;border:0;border-radius:10px;background:#0e0e1a;"/>
    </div>
  </td>`;
}

function buildEmailHtml({ title, dueDate, dueTime, category, userName, type, thumbnail, settings }) {
  const cat = CATEGORY_META[category?.toLowerCase()] ?? CATEGORY_META['task'];
  const isReminder = type === 'reminder';
  const safeTitle = escapeHtml(title);
  const rawUserName = userName || 'there';
  const headerColor = normalizeHex(settings?.headerColor, '#4A90E2');
  const accentColor = normalizeHex(settings?.accentColor, '#4A90E2');
  const brandName = escapeHtml(settings?.brandName || EMAIL_TEXT_DEFAULTS.brandName);
  const productName = escapeHtml(settings?.productName || EMAIL_TEXT_DEFAULTS.productName);
  const badgeEmoji = escapeHtml(settings?.badgeEmoji || EMAIL_TEXT_DEFAULTS.badgeEmoji);
  const badgeText = escapeHtml(settings?.badgeText || EMAIL_TEXT_DEFAULTS.badgeText);
  const greeting = escapeHtml(applyTemplate(settings?.greetingTemplate || EMAIL_TEXT_DEFAULTS.greetingTemplate, { name: rawUserName }));
  const greetingEmoji = escapeHtml(settings?.greetingEmoji || EMAIL_TEXT_DEFAULTS.greetingEmoji);
  const headlineEmoji = escapeHtml(isReminder
    ? settings?.reminderHeadlineEmoji || EMAIL_TEXT_DEFAULTS.reminderHeadlineEmoji
    : settings?.atTimeHeadlineEmoji || EMAIL_TEXT_DEFAULTS.atTimeHeadlineEmoji);
  const headlineTemplate = isReminder
    ? settings?.reminderHeadlineTemplate || EMAIL_TEXT_DEFAULTS.reminderHeadlineTemplate
    : settings?.atTimeHeadlineTemplate || EMAIL_TEXT_DEFAULTS.atTimeHeadlineTemplate;
  const headline = escapeHtml(applyTemplate(headlineTemplate, { title }));
  const subline = escapeHtml(isReminder
    ? settings?.reminderSubline || EMAIL_TEXT_DEFAULTS.reminderSubline
    : settings?.atTimeSubline || EMAIL_TEXT_DEFAULTS.atTimeSubline);
  const cardEmoji = escapeHtml(settings?.cardEmoji || cat.emoji || EMAIL_TEXT_DEFAULTS.cardEmoji);
  const dateLabel = escapeHtml(settings?.dateLabel || EMAIL_TEXT_DEFAULTS.dateLabel);
  const dateEmoji = escapeHtml(settings?.dateEmoji || EMAIL_TEXT_DEFAULTS.dateEmoji);
  const timeLabel = escapeHtml(settings?.timeLabel || EMAIL_TEXT_DEFAULTS.timeLabel);
  const timeEmoji = escapeHtml(settings?.timeEmoji || EMAIL_TEXT_DEFAULTS.timeEmoji);
  const bodyText = escapeHtml(isReminder
    ? settings?.reminderBody || EMAIL_TEXT_DEFAULTS.reminderBody
    : settings?.atTimeBody || EMAIL_TEXT_DEFAULTS.atTimeBody);
  const footerText = escapeHtml(settings?.footerText || 'Sent by NeuroFlow · ADHD Focus Planner · Built for your brain ✨');
  const contactLine = escapeHtml(settings?.contactLine || EMAIL_TEXT_DEFAULTS.contactLine);
  const formattedDate = new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const [h, m] = dueTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const formattedTime = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  const thumbnailHtml = buildThumbnailHtml(thumbnail, accentColor);
  const cardTableWidth = thumbnailHtml ? '100%' : 'auto';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>NeuroFlow Reminder</title></head>
<body style="margin:0;padding:0;background:#0e0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e1a;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#15152a;border-radius:20px;border:1px solid #2a2a3e;overflow:hidden;max-width:560px;width:100%;">
<tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px 32px;border-bottom:1px solid #2a2a3e;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="${NEUROFLOW_LOGO_URL}" alt="${brandName}" width="28" height="28" style="display:inline-block;width:28px;height:28px;border-radius:6px;vertical-align:middle;margin-right:10px;"/><span style="font-size:22px;font-weight:800;color:${headerColor};vertical-align:middle;">${brandName}</span><span style="font-size:13px;color:#8b8b9e;margin-left:8px;vertical-align:middle;">${productName}</span></td>
<td align="right"><span style="background:${accentColor}22;border:1px solid ${accentColor}55;color:${accentColor};font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;">${badgeEmoji} ${badgeText}</span></td>
</tr></table></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 8px;font-size:14px;color:#9ca3af;">${greeting} ${greetingEmoji}</p>
<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#f0f0f5;">${headlineEmoji} ${headline}</h1>
<p style="margin:0 0 28px;font-size:14px;color:#9ca3af;">${subline}</p>
<div style="background:#1e1e35;border:1px solid ${accentColor}55;border-left:4px solid ${accentColor};border-radius:12px;padding:20px 24px;margin-bottom:28px;">
<table width="${cardTableWidth}" cellpadding="0" cellspacing="0"><tr>
<td valign="middle">
<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#f0f0f5;">${cardEmoji} ${safeTitle}</p>
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:24px;"><p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">${dateLabel}</p><p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#e5e7eb;">${dateEmoji} ${formattedDate}</p></td>
<td><p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">${timeLabel}</p><p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#e5e7eb;">${timeEmoji} ${formattedTime}</p></td>
</tr></table>
</td>
${thumbnailHtml}
</tr></table></div>
<p style="margin:0 0 24px;font-size:13px;color:#9ca3af;line-height:1.6;">${bodyText}</p>
</td></tr>
<tr><td style="background:#0e0e1a;padding:20px 32px;border-top:1px solid #2a2a3e;">
<p style="margin:0 0 6px;font-size:11px;color:#4b5563;text-align:center;">${footerText}</p>
<p style="margin:0;font-size:10px;color:#374151;text-align:center;">${contactLine}</p>
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

  const { title, dueDate, dueTime, category, userName, email, reminderOffset, timezone, taskId, thumbnail } = req.body ?? {};
  if (!title || !dueDate || !dueTime || !email) {
    return res.status(400).json({ error: 'Missing required fields: title, dueDate, dueTime, email' });
  }

  console.log('[schedule-reminder] Request:', { title, dueDate, dueTime, email, reminderOffset, timezone, taskId });
  const emailSettings = await getEmailSettings();
  const subjectVars = { title };

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
      const preparedThumbnail = await prepareThumbnailForEmail(thumbnail);
      await sendViaGmail({
        to: email,
        subject: applyTemplate(emailSettings.subjectTask, subjectVars),
        html: buildEmailHtml({ title, dueDate, dueTime, category: category ?? 'task', userName: userName ?? '', type: 'at_time', thumbnail: preparedThumbnail.thumbnail, settings: emailSettings }),
        attachments: preparedThumbnail.gmail,
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
      const preparedThumbnail = await prepareThumbnailForEmail(thumbnail);
      await sendViaGmail({
        to: email,
        subject: `⏰ Starting in ${minsAway} min: ${title}`,
        html: buildEmailHtml({ title, dueDate, dueTime, category: category ?? 'task', userName: userName ?? '', type: 'reminder', thumbnail: preparedThumbnail.thumbnail, settings: emailSettings }),
        attachments: preparedThumbnail.gmail,
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

    const preparedThumbnail = await prepareThumbnailForEmail(thumbnail);
    for (const { sendAt, type } of toSchedule) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `NeuroFlow ADHD <reminders@keepzbrandai.com>`,
          to: [email],
          subject: applyTemplate(type === 'at_time' ? emailSettings.subjectTask : emailSettings.subjectReminder, subjectVars),
          html: buildEmailHtml({ title, dueDate, dueTime, category: category ?? 'task', userName: userName ?? '', type, thumbnail: preparedThumbnail.thumbnail, settings: emailSettings }),
          scheduled_at: sendAt.toISOString(),
          ...(preparedThumbnail.resend.length ? { attachments: preparedThumbnail.resend } : {}),
        }),
      });
      if (emailRes.ok) {
        const data = await emailRes.json();
        results.push({ type, scheduledAt: sendAt.toISOString(), id: data.id, via: 'resend' });
        // Mark the at_time email task as sent now so the auto-delete timer has the right state.
        // filterSentTasks keeps tasks visible until 5 min AFTER due time, so marking early
        // does NOT hide the task prematurely — it only affects cleanup after the due time passes.
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
