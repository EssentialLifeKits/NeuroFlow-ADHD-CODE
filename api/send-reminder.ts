import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * NeuroFlow — retired legacy reminder endpoint.
 *
 * The active reminder workflow lives in schedule-reminder.js. This old route is
 * disabled before launch so it cannot bypass the current Gmail/Resend timing flow.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(410).json({
    error: 'This legacy reminder endpoint has been retired. Use /api/schedule-reminder.',
  });
}
