const {
  getAuthenticatedUser,
  getStripe,
  normalizeEmail,
  subscriptionRecordFromStripe,
  upsertSubscription,
} = require('./_billing-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe is unavailable.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const sessionId = String(body.sessionId || '');
  if (!sessionId) return res.status(400).json({ error: 'Missing Stripe checkout session.' });

  try {
    const authUser = await getAuthenticatedUser(req);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionEmail = normalizeEmail(session.customer_email || session.metadata?.email);
    const authedEmail = normalizeEmail(authUser?.email);

    if (authedEmail && sessionEmail && authedEmail !== sessionEmail) {
      return res.status(403).json({ error: 'Checkout session does not belong to this user.' });
    }

    if (!session.subscription) {
      return res.status(400).json({ error: 'Checkout session has no subscription.' });
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const record = await upsertSubscription(subscriptionRecordFromStripe(subscription, {
      user_email: authedEmail || sessionEmail,
      user_id: authUser?.id || session.metadata?.userId || null,
    }));

    return res.status(200).json({ ok: true, subscription: record });
  } catch (error) {
    console.error('[stripe-sync-session]', error);
    return res.status(500).json({ error: error.message || 'Unable to sync checkout session.' });
  }
};
