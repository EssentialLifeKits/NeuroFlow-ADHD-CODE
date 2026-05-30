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

const ARCHIVE_SETTING_KEY = 'monitor_archived';
const PURGE_AFTER_DAYS = 90;

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

// Newer Stripe API versions moved current_period_end onto the subscription item.
// Read whichever is present, then fall back to a scheduled cancel_at timestamp.
function getPeriodEnd(subscription) {
  if (subscription?.current_period_end) return periodEndToIso(subscription.current_period_end);
  const item = subscription?.items?.data?.[0];
  if (item?.current_period_end) return periodEndToIso(item.current_period_end);
  if (subscription?.cancel_at) return periodEndToIso(subscription.cancel_at);
  return null;
}

// A subscription is "canceling" if cancel_at_period_end is set, OR a future
// cancel_at timestamp exists (some API versions schedule cancellation that way).
function isCancelingSub(subscription) {
  if (subscription?.cancel_at_period_end) return true;
  if (subscription?.cancel_at) {
    const ts = Number(subscription.cancel_at) * 1000;
    if (ts > Date.now()) return true;
  }
  return false;
}

function getStripeCustomerEmail(customer) {
  if (!customer || typeof customer === 'string') return '';
  return normalizeEmail(customer.email);
}

function mergeMetadata(row, metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return row;
  const businessName = metadata.business_name || metadata.businessName || metadata.company || metadata.company_name;
  if (businessName && !row.businessName) row.businessName = businessName;
  return row;
}

function makeEmptyRow(email, key) {
  return {
    key,
    name: displayNameFromEmail(email),
    email,
    phone: '',
    businessName: '',
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
  if (status === 'canceled') return { status: 'canceled', statusLabel: 'Canceled' };
  if (isCancelingSub(subscription)) return { status: 'canceling', statusLabel: 'Canceling' };
  if (ACTIVE_STATUSES.has(status)) return { status: 'active', statusLabel: 'Active' };
  if (status === 'unpaid' || status === 'past_due') return { status: 'past_due', statusLabel: 'Past Due' };
  if (status === 'incomplete' || status === 'incomplete_expired') return { status: 'lead', statusLabel: 'Lead' };
  return { status: status || 'lead', statusLabel: status ? status.replace(/_/g, ' ') : 'Lead' };
}

function fmtDate(value) {
  return value
    ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
}

function renewalLabel(row) {
  const date = fmtDate(row.currentPeriodEnd);
  if (!date) return '-';
  if (row.cancelAtPeriodEnd || row.status === 'canceling') return `Cancels ${date}`;
  if (row.status === 'canceled') return `Canceled ${date}`;
  if (row.status === 'active') return `Renews ${date}`;
  return `Period end ${date}`;
}

// ─── Archive persistence (app_settings key/value JSON map) ─────────────────────

async function readArchiveMap(supabaseUrl) {
  try {
    const rows = await requestJson(
      `${supabaseUrl}/rest/v1/app_settings?key=eq.${ARCHIVE_SETTING_KEY}&select=value`
    );
    const raw = Array.isArray(rows) ? rows[0]?.value : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeArchiveMap(supabaseUrl, map) {
  await requestJson(`${supabaseUrl}/rest/v1/app_settings?on_conflict=key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      key: ARCHIVE_SETTING_KEY,
      value: JSON.stringify(map),
      updated_at: new Date().toISOString(),
    }),
  });
}

// ─── Build the merged user/customer rows ──────────────────────────────────────

async function buildRows(supabaseUrl) {
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
    // Keep an existing real name (from auth metadata) — only fall back to
    // email-derived name if nothing better is available.
    row.name = user.display_name || row.name || displayNameFromEmail(user.email);
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
    const dbStatus = String(sub.status || '').toLowerCase();
    if (row.cancelAtPeriodEnd) {
      row.status = 'canceling';
      row.statusLabel = 'Canceling';
    } else if (ACTIVE_STATUSES.has(dbStatus)) {
      row.status = 'active';
      row.statusLabel = 'Active';
    } else if (dbStatus === 'canceled') {
      row.status = 'canceled';
      row.statusLabel = 'Canceled';
    }
    row.source = row.source === 'stripe' ? 'supabase+stripe' : 'supabase';
  }

  // Live Stripe data is the source of truth — processed last so it overrides.
  const stripe = getStripe();
  let stripeError = null;
  let stripeSubscriptions = [];
  let stripeCustomers = [];

  if (stripe) {
    try {
      const [subscriptionList, customerList] = await Promise.all([
        stripe.subscriptions.list({ limit: 100, status: 'all', expand: ['data.customer'] }),
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
    row.planInterval = getPlanInterval(subscription) || row.planInterval || 'Monthly';
    row.subscriptionStatus = subscription.status || row.subscriptionStatus;
    row.priceId = getPrice(subscription)?.id || row.priceId;
    row.currentPeriodEnd = getPeriodEnd(subscription) || row.currentPeriodEnd;
    row.cancelAtPeriodEnd = isCancelingSub(subscription);
    row.stripeSubscriptionId = subscription.id;
    row.stripeCustomerId = typeof customer === 'string' ? customer : customer?.id || row.stripeCustomerId;
    row.subscriptionCreatedAt = isoFromUnix(subscription.created);
    row.source = row.source === 'supabase' ? 'supabase+stripe' : 'stripe';
  }

  const allRows = Array.from(rowMap.values()).map(row => ({
    ...row,
    name: row.name || displayNameFromEmail(row.email),
    phone: row.phone || '',
    businessName: row.businessName || '',
    cancellationLabel: renewalLabel(row),
    periodEndLabel: fmtDate(row.currentPeriodEnd) || '-',
  }));

  return { allRows, stripeError };
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    const rank = { active: 0, canceling: 1, past_due: 2, canceled: 3, lead: 4 };
    const aRank = rank[a.status] ?? 5;
    const bRank = rank[b.status] ?? 5;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(b.lastSignInAt || b.signedUpAt || b.createdAtStripe || 0).getTime()
      - new Date(a.lastSignInAt || a.signedUpAt || a.createdAtStripe || 0).getTime();
  });
}

module.exports = async function handler(req, res) {
  const authUser = await getAuthenticatedUser(req);
  if (!authUser?.email || !isAdminEmail(authUser.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (!hasSupabaseService()) {
    return res.status(503).json({ error: 'Supabase service role is not configured' });
  }

  const supabaseUrl = getSupabaseUrl();

  // ── POST: archive / restore a user (soft delete) ──────────────────────────
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(body.action || '');
    const email = normalizeEmail(body.email);
    if (!email) return res.status(400).json({ error: 'Missing email.' });

    const map = await readArchiveMap(supabaseUrl);

    if (action === 'archive') {
      // Guard: only inactive accounts (lead / canceled) may be archived.
      const { allRows } = await buildRows(supabaseUrl);
      const target = allRows.find(r => normalizeEmail(r.email) === email);
      if (target && (target.status === 'active' || target.status === 'canceling')) {
        return res.status(409).json({
          error: 'Active or canceling subscribers cannot be archived. Cancel their billing first.',
        });
      }
      map[email] = new Date().toISOString();
    } else if (action === 'restore') {
      delete map[email];
    } else {
      return res.status(400).json({ error: 'Unknown action.' });
    }

    await writeArchiveMap(supabaseUrl, map);
    return res.status(200).json({ ok: true, action, email });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── GET: build merged list, split archived out ────────────────────────────
  const [{ allRows, stripeError }, archiveMap] = await Promise.all([
    buildRows(supabaseUrl),
    readArchiveMap(supabaseUrl),
  ]);

  const now = Date.now();
  const visibleRows = [];
  const archivedRows = [];

  for (const row of allRows) {
    const archivedAt = archiveMap[normalizeEmail(row.email)];
    if (archivedAt) {
      const ageDays = Math.floor((now - new Date(archivedAt).getTime()) / 86400000);
      archivedRows.push({
        ...row,
        archivedAt,
        archivedDaysAgo: ageDays,
        daysUntilPurge: Math.max(0, PURGE_AFTER_DAYS - ageDays),
        readyToPurge: ageDays >= PURGE_AFTER_DAYS,
      });
    } else {
      visibleRows.push(row);
    }
  }

  sortRows(visibleRows);
  archivedRows.sort((a, b) => new Date(a.archivedAt).getTime() - new Date(b.archivedAt).getTime());

  const stats = {
    totalUsers: visibleRows.length,
    active: visibleRows.filter(r => r.status === 'active').length,
    canceling: visibleRows.filter(r => r.status === 'canceling').length,
    canceled: visibleRows.filter(r => r.status === 'canceled').length,
    leads: visibleRows.filter(r => r.status === 'lead').length,
    archived: archivedRows.length,
  };

  return res.status(200).json({
    rows: visibleRows,
    archived: archivedRows,
    stats,
    stripeError,
    purgeAfterDays: PURGE_AFTER_DAYS,
    updatedAt: new Date().toISOString(),
  });
};
