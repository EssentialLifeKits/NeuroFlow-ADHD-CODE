const {
  getAuthenticatedUser,
  getAppUrl,
  getStripe,
  getSubscriptionByEmail,
  isBillingConfigured,
  normalizeEmail,
} = require('./_billing-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isBillingConfigured()) {
    return res.status(503).json({ error: 'Stripe billing is not configured yet.' });
  }

  const stripe = getStripe();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const authUser = await getAuthenticatedUser(req);
  const email = normalizeEmail(authUser?.email || body.email);
  if (!email) return res.status(400).json({ error: 'Missing customer email.' });

  try {
    const subscription = await getSubscriptionByEmail(email);
    if (!subscription?.stripe_customer_id) {
      return res.status(404).json({ error: 'No Stripe customer found for this user.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: getAppUrl(req),
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('[stripe-portal]', error);
    return res.status(500).json({ error: error.message || 'Unable to open billing portal.' });
  }
};
