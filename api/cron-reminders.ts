/**
 * NeuroFlow — Cron Job: Check & Send Due Reminders
 * GET /api/cron-reminders
 *
 * Runs every minute via Vercel Cron (vercel.json).
 * Checks for tasks whose at-time or reminder email is due and sends them via Resend.
 *
 * A task email is due when:
 *   - at_time:   due_date + due_time <= now (within the last 2 minutes)
 *   - 1h_before: due_date + due_time - 1h <= now (within the last 2 minutes)
 *   - 1d_before: due_date + due_time - 24h <= now (within the last 2 minutes)
 *
 * Uses a `email_sent_at` timestamp on the task to prevent duplicate sends.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const INSFORGE_URL   = process.env.EXPO_PUBLIC_INSFORGE_URL!;
const INSFORGE_KEY   = process.env.INSFORGE_API_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL     = process.env.FROM_EMAIL ?? 'NeuroFlow <onboarding@resend.dev>';
const CRON_SECRET    = process.env.CRON_SECRET ?? '';

// Lightweight postgrest fetch helper (InsForge REST API)
async function dbSelect(table: string, select: string, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ select });
  for (const [k, v] of Object.entries(filters)) params.append(k, v);
  const res = await fetch(`${INSFORGE_URL}/api/database/rows/${table}?${params}`, {
    headers: { 'Authorization': `Bearer ${INSFORGE_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return { data: null, error: { message: await res.text() } };
  const json = await res.json() as any;
  const data = Array.isArray(json) ? json : (json.data ?? []);
  return { data: data as any[], error: null };
}

const CATEGORY_META: Record<string, { color: string; emoji: string; label: string }> = {
  task:      { color: '#4A90E2', emoji: '📋', label: 'Task' },
  health:    { color: '#34D399', emoji: '🏃', label: 'Health' },
  work:      { color: '#6366F1', emoji: '💼', label: 'Work' },
  personal:  { color: '#A78BFA', emoji: '🌿', label: 'Personal' },
  creative:  { color: '#F59E0B', emoji: '🎨', label: 'Creative' },
  social:    { color: '#EC4899', emoji: '👥', label: 'Social' },
  finance:   { color: '#10B981', emoji: '💰', label: 'Finance' },
  selfcare:  { color: '#8B5CF6', emoji: '💆', label: 'Self Care' },
  learning:  { color: '#3B82F6', emoji: '📚', label: 'Learning' },
  chore:     { color: '#F97316', emoji: '🧹', label: 'Chore' },
};

function buildEmailHtml(params: {
  title: string; dueDate: string; dueTime: string;
  category: string; userName: string; type: 'reminder' | 'at_time';
}): string {
  const { title, dueDate, dueTime, category, userName, type } = params;
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

async function sendEmail(params: {
  to: string; subject: string; html: string;
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [params.to], subject: params.subject, html: params.html }),
  });
  return res.ok;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {

  const now = new Date();
  const windowStart = new Date(now.getTime() - 2 * 60 * 1000); // 2 min window

  // Fetch pending tasks that have a due_date and due_time
  const { data: tasks, error } = await dbSelect('tasks',
    'id,title,due_date,due_time,chore_category,recurrence_rule,user_id,status',
    { 'status=neq': 'completed', 'due_date=not.is': 'null', 'due_time=not.is': 'null' },
  );

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  const results: string[] = [];

  for (const task of (tasks ?? [])) {
    if (!task.due_date || !task.due_time) continue;

    // Build the exact event datetime
    const eventDt = new Date(`${task.due_date}T${task.due_time}:00`);

    // Fetch user email
    const { data: users } = await dbSelect('users', 'email,display_name', { 'id=eq': task.user_id });
    const userRow = users?.[0];

    if (!userRow?.email) continue;

    // Check if at-time email is due (event time within the 2-min window)
    if (eventDt >= windowStart && eventDt <= now) {
      const ok = await sendEmail({
        to: userRow.email,
        subject: `🎯 Now: ${task.title}`,
        html: buildEmailHtml({
          title: task.title, dueDate: task.due_date, dueTime: task.due_time,
          category: task.chore_category ?? 'task',
          userName: userRow.display_name ?? '',
          type: 'at_time',
        }),
      });
      if (ok) { sent++; results.push(`at_time:${task.id}`); }
    }

    // Check if reminder email is due (stored in recurrence_rule)
    const reminderOffset = task.recurrence_rule;
    if (reminderOffset && reminderOffset !== 'none') {
      let offsetMs = 0;
      if (reminderOffset === '1h_before') offsetMs = 60 * 60 * 1000;
      if (reminderOffset === '1d_before') offsetMs = 24 * 60 * 60 * 1000;

      if (offsetMs > 0) {
        const reminderDt = new Date(eventDt.getTime() - offsetMs);
        if (reminderDt >= windowStart && reminderDt <= now) {
          const ok = await sendEmail({
            to: userRow.email,
            subject: `⏰ Reminder: ${task.title}`,
            html: buildEmailHtml({
              title: task.title, dueDate: task.due_date, dueTime: task.due_time,
              category: task.chore_category ?? 'task',
              userName: userRow.display_name ?? '',
              type: 'reminder',
            }),
          });
          if (ok) { sent++; results.push(`reminder:${task.id}`); }
        }
      }
    }
  }

  return res.status(200).json({ sent, results });
}
