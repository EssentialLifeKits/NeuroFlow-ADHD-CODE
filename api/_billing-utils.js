const Stripe = require('stripe');

const ADMIN_EMAIL = 'essentiallifekits@gmail.com';
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function getAppUrl(req) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAdminEmail(email) {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return null;
  return new Stripe(key);
}

function isBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

function sbHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    ...extra,
  };
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
}

function hasSupabaseService() {
  return Boolean(getSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    const error = new Error(`${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return data;
}

async function getSubscriptionByEmail(email) {
  if (!hasSupabaseService()) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const url = `${getSupabaseUrl()}/rest/v1/subscriptions?select=*&user_email=eq.${encodeURIComponent(normalized)}&limit=1`;
  const rows = await requestJson(url);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token || !hasSupabaseService()) return null;

  try {
    const res = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return {
      id: user?.id || null,
      email: normalizeEmail(user?.email),
      raw: user,
    };
  } catch {
    return null;
  }
}

async function upsertSubscription(record) {
  if (!hasSupabaseService()) return null;
  const userEmail = normalizeEmail(record.user_email || record.email);
  if (!userEmail) return null;

  const payload = {
    user_email: userEmail,
    user_id: record.user_id || null,
    stripe_customer_id: record.stripe_customer_id || null,
    stripe_subscription_id: record.stripe_subscription_id || null,
    status: record.status || 'incomplete',
    price_id: record.price_id || null,
    current_period_end: record.current_period_end || null,
    cancel_at_period_end: Boolean(record.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };

  const url = `${getSupabaseUrl()}/rest/v1/subscriptions?on_conflict=user_email`;
  const rows = await requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

function subscriptionIsActive(subscription) {
  if (!subscription) return false;
  return ACTIVE_STATUSES.has(String(subscription.status || '').toLowerCase());
}

function periodEndToIso(value) {
  if (!value) return null;
  return new Date(Number(value) * 1000).toISOString();
}

function subscriptionRecordFromStripe(subscription, fallback = {}) {
  const item = subscription.items?.data?.[0];
  return {
    user_email: fallback.user_email,
    user_id: fallback.user_id,
    stripe_customer_id: typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    price_id: item?.price?.id || fallback.price_id || null,
    current_period_end: periodEndToIso(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  };
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = {
  ACTIVE_STATUSES,
  ADMIN_EMAIL,
  getAppUrl,
  getAuthenticatedUser,
  getStripe,
  getSubscriptionByEmail,
  getSupabaseUrl,
  hasSupabaseService,
  isAdminEmail,
  isBillingConfigured,
  normalizeEmail,
  periodEndToIso,
  readRawBody,
  requestJson,
  subscriptionIsActive,
  subscriptionRecordFromStripe,
  upsertSubscription,
};
