const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BUCKET = 'resource-assets';

function isAuthorized(req) {
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
    headers: {
      ...sbHeaders(),
      ...(options.headers || {}),
    },
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
    const body = JSON.stringify({
      prefix,
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    const rows = await requestJson(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    for (const item of rows || []) {
      if (!item.name || item.name === '.emptyFolderPlaceholder') continue;
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = !item.id && (!item.metadata || Object.keys(item.metadata || {}).length === 0);
      if (isFolder) {
        files = files.concat(await listStorage(fullPath));
      } else {
        files.push({
          path: fullPath,
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

function ageHours(file) {
  const date = new Date(file.updated_at || file.created_at || 0);
  return Number.isFinite(date.getTime()) ? (Date.now() - date.getTime()) / 36e5 : Infinity;
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

module.exports = async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error: 'Missing Supabase environment variables',
      hasSupabaseUrl: Boolean(SUPABASE_URL),
      hasServiceRoleKey: Boolean(SUPABASE_SERVICE_KEY),
    });
  }

  try {
    const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
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
      tables[table] = {
        ok: result.ok,
        rowCount: result.rows.length,
        error: result.error || null,
      };
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
    const activeReferencedFiles = [...refs.entries()]
      .map(([path, sources]) => {
        const file = fileMap.get(path);
        return {
          path,
          size: file?.size || 0,
          sizeText: formatBytes(file?.size || 0),
          sources: [...sources],
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    const missingReferencedFiles = activeReferencedFiles.filter(file => !fileMap.has(file.path));
    const orphanCandidates = [];
    const recentUnreferencedProtected = [];

    for (const file of files) {
      if (refs.has(file.path)) continue;
      const hours = ageHours(file);
      if (hours < 24) {
        recentUnreferencedProtected.push({ ...file, ageHours: hours, sizeText: formatBytes(file.size) });
        continue;
      }
      const folder = file.path.split('/')[0] || '(root)';
      const likelyTest = folder === 'email-thumbnails' || /test|tmp|temp|sample|demo|copy|untitled|screenshot|thumbnail/i.test(file.path);
      orphanCandidates.push({
        ...file,
        ageHours: hours,
        sizeText: formatBytes(file.size),
        reason: folder === 'email-thumbnails'
          ? 'Unreferenced email thumbnail older than 24h'
          : likelyTest
            ? 'Unreferenced likely test/temp media older than 24h'
            : 'Unreferenced storage object older than 24h; review before deletion',
      });
    }

    const storageByFolder = files.reduce((acc, file) => {
      const folder = file.path.split('/')[0] || '(root)';
      acc[folder] = (acc[folder] || 0) + file.size;
      return acc;
    }, {});

    return res.status(200).json({
      mode: 'audit-only',
      deleted: false,
      auditedAt: new Date().toISOString(),
      projectRef,
      bucket: BUCKET,
      tables,
      storage: {
        fileCount: files.length,
        totalBytes: files.reduce((sum, file) => sum + file.size, 0),
        totalText: formatBytes(files.reduce((sum, file) => sum + file.size, 0)),
        byFolder: Object.fromEntries(Object.entries(storageByFolder).map(([folder, bytes]) => [folder, { bytes, text: formatBytes(bytes) }])),
      },
      activeReferencedFiles,
      missingReferencedFiles,
      orphanCandidates: orphanCandidates.sort((a, b) => a.path.localeCompare(b.path)),
      orphanCandidateBytes: orphanCandidates.reduce((sum, file) => sum + file.size, 0),
      orphanCandidateText: formatBytes(orphanCandidates.reduce((sum, file) => sum + file.size, 0)),
      recentUnreferencedProtected: recentUnreferencedProtected.sort((a, b) => a.path.localeCompare(b.path)),
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
};
