const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'NeuroFlow <noreply@keepzbrandai.com>';
const CLEANUP_REPORT_EMAIL = process.env.CLEANUP_REPORT_EMAIL ?? 'essentiallifekits@gmail.com';
const BUCKET = 'resource-assets';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function authorized(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  return CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
}

function sbHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    apikey: SUPABASE_SERVICE_KEY,
    ...extra,
  };
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }
  return data;
}

async function getTable(table, select) {
  try {
    const limit = 1000;
    let offset = 0;
    let rows = [];
    while (true) {
      const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}&offset=${offset}`;
      const page = await requestJson(url, { headers: { Prefer: 'count=exact' } });
      rows = rows.concat(Array.isArray(page) ? page : []);
      if (!Array.isArray(page) || page.length < limit) break;
      offset += limit;
    }
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, rows: [], error: e?.message || String(e) };
  }
}

async function listStorage(prefix = '') {
  const limit = 1000;
  let offset = 0;
  let files = [];
  while (true) {
    const rows = await requestJson(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix,
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });

    for (const item of rows || []) {
      if (!item.name || item.name === '.emptyFolderPlaceholder') continue;
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = !item.id && (!item.metadata || Object.keys(item.metadata || {}).length === 0);
      if (isFolder) {
        files = files.concat(await listStorage(path));
      } else {
        files.push({
          path,
          size: Number(item.metadata?.size || 0),
          mimetype: item.metadata?.mimetype || item.metadata?.contentType || '',
          created_at: item.created_at || null,
          updated_at: item.updated_at || item.last_accessed_at || null,
        });
      }
    }

    if (!Array.isArray(rows) || rows.length < limit) break;
    offset += limit;
  }
  return files;
}

function addReference(refs, path, source) {
  const clean = String(path || '').replace(/^\/+/, '').split(/[?#]/)[0];
  if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return;
  if (!refs.has(clean)) refs.set(clean, new Set());
  refs.get(clean).add(source);
}

function extractStoragePaths(value, source, refs) {
  if (value == null) return;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return;

    try {
      const url = new URL(text);
      for (const marker of [
        `/storage/v1/object/public/${BUCKET}/`,
        `/storage/v1/object/sign/${BUCKET}/`,
        `/storage/v1/object/${BUCKET}/`,
      ]) {
        const index = url.pathname.indexOf(marker);
        if (index >= 0) addReference(refs, decodeURIComponent(url.pathname.slice(index + marker.length)), source);
      }
    } catch {}

    for (const marker of [`/${BUCKET}/`, `${BUCKET}/`]) {
      const index = text.indexOf(marker);
      if (index >= 0) addReference(refs, decodeURIComponent(text.slice(index + marker.length)), source);
    }

    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
        extractStoragePaths(JSON.parse(text), source, refs);
      } catch {}
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => extractStoragePaths(item, `${source}[${index}]`, refs));
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => extractStoragePaths(item, `${source}.${key}`, refs));
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function isOlderThan24Hours(file) {
  const date = new Date(file.updated_at || file.created_at || 0);
  return Number.isFinite(date.getTime()) && Date.now() - date.getTime() > ONE_DAY_MS;
}

async function getMediaAudit() {
  const files = await listStorage();
  const refs = new Map();
  const tableDefs = {
    resource_cards: 'id,title,is_active,slide_deck_url,icon_image_url,link,created_at,updated_at',
    app_settings: 'key,value,updated_at',
    tasks: 'id,title,status,due_date,due_time,recurrence_rule,sticker_id,created_at,updated_at,completed_at,user_id',
    users: 'id,email,display_name,avatar_url,created_at,updated_at',
    focus_sessions: 'id,user_id,created_at,notes',
  };
  const tables = {};

  for (const [table, select] of Object.entries(tableDefs)) {
    const result = await getTable(table, select);
    tables[table] = { ok: result.ok, rowCount: result.rows.length, error: result.error || null };
    if (!result.ok) continue;

    for (const row of result.rows) {
      const id = row.id || row.key || '(no-id)';
      if (table === 'resource_cards') {
        extractStoragePaths(row.slide_deck_url, `${table}.${id}.slide_deck_url${row.is_active ? ' [active]' : ' [inactive]'}`, refs);
        extractStoragePaths(row.icon_image_url, `${table}.${id}.icon_image_url${row.is_active ? ' [active]' : ' [inactive]'}`, refs);
      } else if (table === 'app_settings') {
        extractStoragePaths(row.value, `${table}.${row.key}`, refs);
      } else if (table === 'tasks') {
        extractStoragePaths(row.sticker_id, `${table}.${id}.sticker_id status=${row.status || ''} recurrence=${row.recurrence_rule || ''}`, refs);
      } else if (table === 'users') {
        extractStoragePaths(row.avatar_url, `${table}.${id}.avatar_url`, refs);
      } else {
        extractStoragePaths(row, `${table}.${id}`, refs);
      }
    }
  }

  const fileMap = new Map(files.map(file => [file.path, file]));
  const activeReferencedFiles = [...refs.entries()].map(([path, sources]) => {
    const file = fileMap.get(path);
    return {
      path,
      size: file?.size || 0,
      sizeText: formatBytes(file?.size || 0),
      sources: [...sources],
    };
  });
  const missingReferencedFiles = activeReferencedFiles.filter(file => !fileMap.has(file.path));
  const orphanCandidates = files
    .filter(file => !refs.has(file.path) && isOlderThan24Hours(file))
    .map(file => ({ ...file, sizeText: formatBytes(file.size) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    tables,
    files,
    activeReferencedFiles: activeReferencedFiles.sort((a, b) => a.path.localeCompare(b.path)),
    missingReferencedFiles,
    orphanCandidates,
  };
}

async function sendCleanupEmail(summary) {
  if (!RESEND_API_KEY || !CLEANUP_REPORT_EMAIL) return { skipped: true, reason: 'Missing email environment' };
  const deletedList = summary.deleted.length
    ? summary.deleted.map(file => `<li><code>${file.path}</code> - ${file.sizeText}</li>`).join('')
    : '<li>No orphan media needed deletion.</li>';
  const protectedList = summary.activeReferencedFiles.length
    ? summary.activeReferencedFiles.map(file => `<li><code>${file.path}</code> - ${file.sizeText}</li>`).join('')
    : '<li>No referenced storage files found.</li>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [CLEANUP_REPORT_EMAIL],
      subject: 'NeuroFlow monthly storage cleanup report',
      html: `<!doctype html><html><body style="margin:0;padding:24px;background:#0e0e1a;color:#f4f7fb;font-family:Arial,sans-serif;">
        <div style="max-width:680px;margin:auto;background:#15152a;border:1px solid #2a2a3e;border-radius:16px;padding:24px;">
          <h1 style="color:#4A90E2;margin-top:0;">NeuroFlow Storage Cleanup</h1>
          <p>Monthly cleanup completed at ${summary.cleanedAt}.</p>
          <p><strong>Deleted:</strong> ${summary.deleted.length} file(s), ${summary.deletedText}</p>
          <p><strong>Protected active referenced files:</strong> ${summary.activeReferencedFiles.length}</p>
          <p><strong>Missing referenced files:</strong> ${summary.missingReferencedFiles.length}</p>
          <h2 style="color:#4A90E2;">Deleted orphan media</h2>
          <ul>${deletedList}</ul>
          <h2 style="color:#4A90E2;">Protected referenced media</h2>
          <ul>${protectedList}</ul>
        </div>
      </body></html>`,
    }),
  });
  if (!res.ok) return { skipped: false, ok: false, status: res.status, body: await res.text() };
  return { skipped: false, ok: true };
}

async function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error: 'Missing Supabase environment variables',
      hasSupabaseUrl: Boolean(SUPABASE_URL),
      hasServiceRoleKey: Boolean(SUPABASE_SERVICE_KEY),
    });
  }

  try {
    const audit = await getMediaAudit();
    const body = await parseBody(req);
    const approvedPaths = Array.isArray(body.approvedPaths) ? new Set(body.approvedPaths) : null;
    const candidates = approvedPaths
      ? audit.orphanCandidates.filter(file => approvedPaths.has(file.path))
      : audit.orphanCandidates;
    const unsafeRequestedPaths = approvedPaths
      ? [...approvedPaths].filter(path => !audit.orphanCandidates.some(file => file.path === path))
      : [];

    if (unsafeRequestedPaths.length) {
      return res.status(409).json({
        error: 'Some requested paths are no longer safe orphan candidates',
        unsafeRequestedPaths,
        deleted: [],
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const deleted = [];
    const failed = [];

    if (candidates.length) {
      const { data, error } = await supabase.storage.from(BUCKET).remove(candidates.map(file => file.path));
      if (error) {
        failed.push({ paths: candidates.map(file => file.path), error: error.message });
      } else {
        const removedPaths = new Set((data || []).map(item => item.name || item.path).filter(Boolean));
        for (const file of candidates) {
          deleted.push({ ...file, confirmedByStorage: removedPaths.size ? removedPaths.has(file.path) : true });
        }
      }
    }

    const verify = await getMediaAudit();
    const deletedBytes = deleted.reduce((sum, file) => sum + file.size, 0);
    const summary = {
      mode: approvedPaths ? 'approved-cleanup' : 'monthly-cleanup',
      cleanedAt: new Date().toISOString(),
      bucket: BUCKET,
      deleted,
      deletedBytes,
      deletedText: formatBytes(deletedBytes),
      failed,
      unsafeRequestedPaths,
      remainingOrphanCandidates: verify.orphanCandidates,
      activeReferencedFiles: verify.activeReferencedFiles,
      missingReferencedFiles: verify.missingReferencedFiles,
      tables: verify.tables,
    };
    summary.email = await sendCleanupEmail(summary);

    return res.status(failed.length ? 207 : 200).json(summary);
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
};
