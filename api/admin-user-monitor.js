const {
  ACTIVE_STATUSES,
  getAuthenticatedUser,
  getStripe,
  getSupabaseUrl,
  hasSupabaseService,
  isAdminEmail,
  normalizeEmail,
  periodEndToIso,
  requestJson,
} = require('./_billing-utils');

function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'Customer';
  return local
    .replace(/[._-]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isoFromUnix(value) {
  return value ? new Date(Number(value) * 1000).toISOString() : null;
}

function getPrice(subscription) {
  return subscription?.items?.data?.[0]?.price || null;
}

function getPlanName(subscription, fallback = 'NeuroFlow Pro') {
  const product = getPrice(subscription)?.product;
  if (product && typeof product === 'object' && product.name) return product.name;
  return fallback;
}

function getPlanInterval(subscription) {
  const interval = getPrice(subscription)?.recurring?.interval;
  if (!interval) return null;
  return interval === 'month' ? 'Monthly' : interval.charAt(0).toUpperCase() + interval.slice(1);
}

function getStripeCustomerEmail(customer) {
  if (!customer || typeof customer === 'string') return '';
  return normalizeEmail(customer.email);
}

function mergeMetadata(row, metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return row;
  const businessName = metadata.business_name || metadata.businessName || metadata.company || metadata.company_name;
  const instagramHandle = metadata.instagram || metadata.instagram_handle || metadata.ig || metadata.handle;
  if (businessName && !row.businessName) row.businessName = businessName;
  if (instagramHandle && !row.instagramHandle) row.instagramHandle = instagramHandle;
  return row;
}

function makeEmptyRow(email, key) {
  return {
    key,
    name: displayNameFromEmail(email),
    email,
    phone: '',
    businessName: '',
    instagramHandle: '',
    signedUpAt: null,
    lastSignInAt: null,
    status: 'lead',
    statusLabel: 'Lead',
    planName: 'None',
    planInterval: null,
    subscriptionStatus: 'lead',
    priceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancellationLabel: '-',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    source: 'supabase',
  };
}

function statusFromSubscription(subscription) {
  const status = String(subscription?.status || 'lead').toLowerCase();
  if (subscription?.cancel_at_period_end) return { status: 'canceling', statusLabel: 'Cancels Soon' };
  if (ACTIVE_STATUSES.has(status)) return { status: 'active', statusLabel: 'Active' };
  if (status === 'canceled') return { status: 'canceled', statusLabel: 'Canceled' };
  if (status === 'unpaid' || status === 'past_due') return { status: 'past_due', statusLabel: 'Past Due' };
  if (status === 'incomplete' || status === 'incomplete_expired') return { status: 'lead', statusLabel: 'Lead' };
  return { status: status || 'lead', statusLabel: status ? status.replace(/_/g, ' ') : 'Lead' };
}

function renewalLabel(row) {
  const date = row.currentPeriodEnd
    ? new Date(row.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  if (!date) return '-';
  if (row.cancelAtPeriodEnd || row.status === 'canceling') return `Cancels ${date}`;
  if (row.status === 'canceled') return `Canceled ${date}`;
  if (row.status === 'active') return `Renews ${date}`;
  return `Period end ${date}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authUser = await getAuthenticatedUser(req);
  if (!authUser?.email || !isAdminEmail(authUser.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!hasSupabaseService()) {
    return res.status(503).json({ error: 'Supabase service role is not configured' });
  }

  const supabaseUrl = getSupabaseUrl();
  const rowMap = new Map();

  function ensureRow(email, fallbackKey) {
    const normalized = normalizeEmail(email);
    const key = normalized || fallbackKey;
    if (!rowMap.has(key)) rowMap.set(key, makeEmptyRow(normalized, key));
    return rowMap.get(key);
  }

  const [users, dbSubscriptions, authUsersResponse] = await Promise.all([
    requestJson(`${supabaseUrl}/rest/v1/users?select=*&order=created_at.desc`).catch(() => []),
    requestJson(`${supabaseUrl}/rest/v1/subscriptions?select=*`).catch(() => []),
    requestJson(`${supabaseUrl}/auth/v1/admin/users?per_page=100&page=1`).catch(() => null),
  ]);

  const authUsers = Array.isArray(authUsersResponse?.users) ? authUsersResponse.users : [];

  for (const authUser of authUsers) {
    const email = normalizeEmail(authUser.email);
    const row = ensureRow(email, authUser.id);
    row.email = email || row.email;
    row.name = authUser.user_metadata?.full_name
      || authUser.user_metadata?.name
      || row.name
      || displayNameFromEmail(email);
    row.signedUpAt = authUser.created_at || row.signedUpAt;
    row.lastSignInAt = authUser.last_sign_in_at || row.lastSignInAt;
    row.authUserId = authUser.id || row.authUserId;
    row.source = row.source === 'stripe' ? 'supabase+stripe' : 'supabase';
  }

  for (const user of Array.isArray(users) ? users : []) {
    const row = ensureRow(user.email, user.id);
    row.name = user.display_name || displayNameFromEmail(user.email);
    row.email = normalizeEmail(user.email);
    row.signedUpAt = user.created_at || row.signedUpAt;
    row.lastSignInAt = user.updated_at || row.lastSignInAt;
    row.userId = user.id || row.userId;
    row.authUserId = user.auth_user_id || row.authUserId;
    row.source = 'supabase';
  }

  for (const sub of Array.isArray(dbSubscriptions) ? dbSubscriptions : []) {
    const row = ensureRow(sub.user_email, sub.id);
    row.email = normalizeEmail(sub.user_email) || row.email;
    row.stripeCustomerId = sub.stripe_customer_id || row.stripeCustomerId;
    row.stripeSubscriptionId = sub.stripe_subscription_id || row.stripeSubscriptionId;
    row.subscriptionStatus = sub.status || row.subscriptionStatus;
    row.priceId = sub.price_id || row.priceId;
    row.currentPeriodEnd = sub.current_period_end || row.currentPeriodEnd;
    row.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
    const active = ACTIVE_STATUSES.has(String(sub.status || '').toLowerCase());
    if (row.cancelAtPeriodEnd) {
      row.status = 'canceling';
      row.statusLabel = 'Cancels Soon';
    } else if (active) {
      row.status = 'active';
      row.statusLabel = 'Active';
    } else if (String(sub.status || '').toLowerCase() === 'canceled') {
      row.status = 'canceled';
      row.statusLabel = 'Canceled';
    }
    row.source = row.source === 'stripe' ? 'supabase+stripe' : 'supabase';
  }

  const stripe = getStripe();
  let stripeError = null;
  let stripeSubscriptions = [];
  let stripeCustomers = [];

  if (stripe) {
    try {
      const [subscriptionList, customerList] = await Promise.all([
        stripe.subscriptions.list({
          limit: 100,
          status: 'all',
          expand: ['data.customer', 'data.items.data.price.product'],
        }),
        stripe.customers.list({ limit: 100 }),
      ]);
      stripeSubscriptions = subscriptionList.data || [];
      stripeCustomers = customerList.data || [];
    } catch (error) {
      stripeError = error?.message || 'Unable to load Stripe data';
    }
  } else {
    stripeError = 'Stripe is not configured';
  }

  for (const customer of stripeCustomers) {
    const email = getStripeCustomerEmail(customer);
    const row = ensureRow(email, customer.id);
    if (email) row.email = email;
    row.name = customer.name || row.name || displayNameFromEmail(email);
    row.phone = customer.phone || row.phone || '';
    row.stripeCustomerId = customer.id || row.stripeCustomerId;
    row.createdAtStripe = isoFromUnix(customer.created) || row.createdAtStripe;
    mergeMetadata(row, customer.metadata);
    row.source = row.source === 'supabase' ? 'supabase+stripe' : 'stripe';
  }

  for (const subscription of stripeSubscriptions) {
    const customer = subscription.customer;
    const customerEmail = getStripeCustomerEmail(customer);
    const fallbackEmail = customerEmail || normalizeEmail(subscription.metadata?.email);
    const row = ensureRow(fallbackEmail, subscription.id);
    if (fallbackEmail) row.email = fallbackEmail;
    if (customer && typeof customer === 'object') {
      row.name = customer.name || row.name || displayNameFromEmail(fallbackEmail);
      row.phone = customer.phone || row.phone || '';
      row.stripeCustomerId = customer.id || row.stripeCustomerId;
      mergeMetadata(row, customer.metadata);
    }
    mergeMetadata(row, subscription.metadata);
    const statusInfo = statusFromSubscription(subscription);
    row.status = statusInfo.status;
    row.statusLabel = statusInfo.statusLabel;
    row.planName = getPlanName(subscription, row.planName === 'None' ? 'NeuroFlow Pro' : row.planName);
    row.planInterval = getPlanInterval(subscription) || row.planInterval;
    row.subscriptionStatus = subscription.status || row.subscriptionStatus;
    row.priceId = getPrice(subscription)?.id || row.priceId;
    row.currentPeriodEnd = periodEndToIso(subscription.current_period_end) || row.currentPeriodEnd;
    row.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    row.stripeSubscriptionId = subscription.id;
    row.stripeCustomerId = typeof customer === 'string' ? customer : customer?.id || row.stripeCustomerId;
    row.subscriptionCreatedAt = isoFromUnix(subscription.created);
    row.source = row.source === 'supabase' ? 'supabase+stripe' : 'stripe';
  }

  const rows = Array.from(rowMap.values())
    .map(row => ({
      ...row,
      name: row.name || displayNameFromEmail(row.email),
      phone: row.phone || 'No phone',
      businessName: row.businessName || 'No business name',
      instagramHandle: row.instagramHandle || 'No Instagram handle',
      cancellationLabel: renewalLabel(row),
      periodEndLabel: row.currentPeriodEnd
        ? new Date(row.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '-',
    }))
    .sort((a, b) => {
      const rank = { active: 0, canceling: 1, past_due: 2, canceled: 3, lead: 4 };
      const aRank = rank[a.status] ?? 5;
      const bRank = rank[b.status] ?? 5;
      if (aRank !== bRank) return aRank - bRank;
      return new Date(b.lastSignInAt || b.signedUpAt || b.createdAtStripe || 0).getTime()
        - new Date(a.lastSignInAt || a.signedUpAt || a.createdAtStripe || 0).getTime();
    });

  const stats = {
    totalUsers: rows.length,
    active: rows.filter(row => row.status === 'active').length,
    canceling: rows.filter(row => row.status === 'canceling').length,
    canceled: rows.filter(row => row.status === 'canceled').length,
    leads: rows.filter(row => row.status === 'lead').length,
  };

  return res.status(200).json({
    rows,
    stats,
    stripeError,
    updatedAt: new Date().toISOString(),
  });
};
