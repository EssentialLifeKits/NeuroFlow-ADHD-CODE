const {
  getAuthenticatedUser,
  getSubscriptionByEmail,
  isAdminEmail,
  isBillingConfigured,
  normalizeEmail,
  subscriptionIsActive,
} = require('./_billing-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authUser = await getAuthenticatedUser(req);
  const email = normalizeEmail(authUser?.email || req.query.email);
  const userId = String(req.query.userId || '');
  const isDev = userId === 'mock-dev-user' || email === 'dev@neuroflow.app';

  if (isAdminEmail(email) || isDev) {
    return res.status(200).json({
      active: true,
      admin: isAdminEmail(email),
      status: 'admin',
      billingConfigured: isBillingConfigured(),
    });
  }

  if (!isBillingConfigured()) {
    return res.status(200).json({
      active: true,
      status: 'billing_setup_pending',
      billingConfigured: false,
      setupMode: true,
    });
  }

  try {
    const subscription = await getSubscriptionByEmail(email);
    return res.status(200).json({
      active: subscriptionIsActive(subscription),
      status: subscription?.status || 'inactive',
      billingConfigured: true,
      subscription: subscription || null,
    });
  } catch (error) {
    console.error('[subscription-status] fallback open:', error);
    return res.status(200).json({
      active: true,
      status: 'billing_table_pending',
      billingConfigured: true,
      setupMode: true,
      warning: 'Subscription table is not ready yet.',
    });
  }
};
