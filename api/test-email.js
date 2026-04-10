/**
 * NeuroFlow — Email diagnostic endpoint
 * GET /api/test-email?to=youraddress@email.com
 * Returns the raw Resend API response so we can see exactly what is failing.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
  const FROM_EMAIL     = process.env.FROM_EMAIL ?? 'NeuroFlow <noreply@keepzbrandai.com>';
  const toEmail        = req.query?.to || req.body?.to || '';

  const diagnostics = {
    hasResendKey: !!RESEND_API_KEY,
    resendKeyPrefix: RESEND_API_KEY ? RESEND_API_KEY.slice(0, 8) + '...' : 'MISSING',
    fromEmail: FROM_EMAIL,
    toEmail: toEmail || 'NOT PROVIDED',
    hasInsforgeUrl: !!(process.env.INSFORGE_URL || process.env.EXPO_PUBLIC_INSFORGE_URL),
    nodeVersion: process.version,
  };

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not set in Vercel env vars', diagnostics });
  }

  if (!toEmail) {
    return res.status(400).json({
      error: 'Provide ?to=your@email.com in the URL',
      diagnostics,
      usage: 'GET /api/test-email?to=youraddress@email.com',
    });
  }

  let resendStatus, resendBody;
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        subject: '🧪 NeuroFlow Email Test',
        html: '<h1>NeuroFlow test email</h1><p>If you received this, Resend is working correctly.</p>',
      }),
    });
    resendStatus = emailRes.status;
    resendBody = await emailRes.json().catch(() => emailRes.text());
  } catch (e) {
    return res.status(500).json({ error: 'fetch to Resend failed', message: String(e), diagnostics });
  }

  return res.status(200).json({
    resendStatus,
    resendBody,
    diagnostics,
    success: resendStatus >= 200 && resendStatus < 300,
  });
};
