const {
  getAuthenticatedUser,
  getAppUrl,
  getStripe,
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
  if (!stripe) return res.status(503).json({ error: 'Stripe is unavailable.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const authUser = await getAuthenticatedUser(req);
  const email = normalizeEmail(authUser?.email || body.email);
  const userId = String(authUser?.id || body.userId || '');

  if (!email) return res.status(400).json({ error: 'Missing customer email.' });

  try {
    const appUrl = getAppUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      metadata: {
        userId,
        email,
        product: 'neuroflow_pro',
      },
      subscription_data: {
        metadata: {
          userId,
          email,
          product: 'neuroflow_pro',
        },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('[stripe-checkout]', error);
    return res.status(500).json({ error: error.message || 'Unable to create checkout session.' });
  }
};
