/**
 * NeuroFlow — Email Reminder API Route
 * POST /api/send-reminder
 *
 * Called by the cron job (/api/cron-reminders) to send a single reminder email.
 * Also called directly when a task is saved (for the at-time email scheduling test).
 *
 * Body: { taskId, title, dueDate, dueTime, category, userEmail, userName, type }
 * type: 'reminder' | 'at_time'
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'NeuroFlow <noreply@keepzbrandai.com>';

// Category colors matching the app theme
const CATEGORY_COLORS: Record<string, { color: string; emoji: string; label: string }> = {
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

function buildEmailHtml({
  title, dueDate, dueTime, category, userName, type,
}: {
  title: string; dueDate: string; dueTime: string;
  category: string; userName: string; type: 'reminder' | 'at_time';
}): string {
  const cat = CATEGORY_COLORS[category?.toLowerCase()] ?? CATEGORY_COLORS['task'];
  const isReminder = type === 'reminder';

  const formattedDate = new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const [h, m] = dueTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const formattedTime = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;

  const headline = isReminder
    ? `⏰ Reminder: <strong>${title}</strong>`
    : `🎯 It's time: <strong>${title}</strong>`;

  const subline = isReminder
    ? `Your scheduled task is coming up soon.`
    : `Your scheduled task is happening now.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NeuroFlow Reminder</title>
</head>
<body style="margin:0;padding:0;background:#0e0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e1a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#15152a;border-radius:20px;border:1px solid #2a2a3e;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px 32px;border-bottom:1px solid #2a2a3e;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:800;color:#4A90E2;letter-spacing:-0.5px;">NeuroFlow</span>
                    <span style="font-size:13px;color:#6b7280;margin-left:8px;">Focus Planner</span>
                  </td>
                  <td align="right">
                    <span style="background:${cat.color}22;border:1px solid ${cat.color}55;color:${cat.color};font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:0.5px;">${cat.emoji} ${cat.label.toUpperCase()}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">

              <!-- Greeting -->
              <p style="margin:0 0 8px;font-size:14px;color:#9ca3af;">Hi ${userName || 'there'} 👋</p>
              <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#f0f0f5;line-height:1.3;">${headline}</h1>
              <p style="margin:0 0 28px;font-size:14px;color:#9ca3af;">${subline}</p>

              <!-- Task Card -->
              <div style="background:#1e1e35;border:1px solid ${cat.color}44;border-left:4px solid ${cat.color};border-radius:12px;padding:20px 24px;margin-bottom:28px;">
                <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#f0f0f5;">${cat.emoji} ${title}</p>
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:24px;">
                      <p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.5px;text-transform:uppercase;">DATE</p>
                      <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#e5e7eb;">📅 ${formattedDate}</p>
                    </td>
                    <td>
                      <p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.5px;text-transform:uppercase;">TIME</p>
                      <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#e5e7eb;">🕐 ${formattedTime}</p>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA -->
              <p style="margin:0 0 24px;font-size:13px;color:#9ca3af;line-height:1.6;">
                ${isReminder ? 'Head to your NeuroFlow planner to review your task and get ready.' : 'Open NeuroFlow and stay in your flow state. You\'ve got this! 🌸'}
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0e0e1a;padding:20px 32px;border-top:1px solid #2a2a3e;">
              <p style="margin:0;font-size:11px;color:#4b5563;text-align:center;">
                Sent by NeuroFlow · ADHD Focus Planner &nbsp;·&nbsp;
                <span style="color:#4A90E2;">Built for your brain ✨</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, dueDate, dueTime, category, userEmail, userName, type } = req.body ?? {};

  if (!title || !dueDate || !dueTime || !userEmail) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const subject = type === 'reminder'
    ? `⏰ Reminder: ${title}`
    : `🎯 Now: ${title}`;

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [userEmail],
        subject,
        html: buildEmailHtml({ title, dueDate, dueTime, category: category ?? 'task', userName: userName ?? '', type: type ?? 'at_time' }),
      }),
    });

    const data = await emailRes.json() as any;
    if (!emailRes.ok) return res.status(500).json({ error: data.message ?? 'Resend error' });
    return res.status(200).json({ success: true, id: data.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
