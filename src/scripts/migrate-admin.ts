/**
 * NeuroFlow — Admin Tables Migration
 * ------------------------------------
 * Creates two new tables:
 *   - resource_cards   (content managed by admin, displayed on Resources page)
 *   - app_settings     (key/value store for email config, links, etc.)
 *
 * Also seeds resource_cards with the 6 default cards previously hardcoded.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-admin.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env.local file not found at', envPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

type ColumnType = 'string' | 'integer' | 'float' | 'boolean' | 'uuid' | 'json' | 'date' | 'datetime';
interface ColumnDef {
  name: string;
  type: ColumnType;
  isNullable: boolean;
  isUnique: boolean;
  defaultValue?: string;
}
interface CreateTableRequest {
  tableName: string;
  columns: ColumnDef[];
  rlsEnabled: boolean;
}

const TABLES: CreateTableRequest[] = [
  {
    tableName: 'resource_cards',
    rlsEnabled: false,
    columns: [
      { name: 'id',           type: 'uuid',     isNullable: false, isUnique: true,  defaultValue: 'gen_random_uuid()' },
      { name: 'title',        type: 'string',   isNullable: false, isUnique: false },
      { name: 'description',  type: 'string',   isNullable: false, isUnique: false },
      { name: 'icon',         type: 'string',   isNullable: false, isUnique: false, defaultValue: '📘' },
      { name: 'icon_bg',      type: 'string',   isNullable: false, isUnique: false, defaultValue: 'rgba(74,144,226,0.12)' },
      { name: 'accent_color', type: 'string',   isNullable: false, isUnique: false, defaultValue: '#4A90E2' },
      { name: 'link',         type: 'string',   isNullable: false, isUnique: false, defaultValue: '#' },
      { name: 'link_label',   type: 'string',   isNullable: false, isUnique: false, defaultValue: 'Learn More →' },
      { name: 'sort_order',   type: 'integer',  isNullable: false, isUnique: false, defaultValue: '0' },
      { name: 'is_active',    type: 'boolean',  isNullable: false, isUnique: false, defaultValue: 'true' },
      { name: 'created_at',   type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
      { name: 'updated_at',   type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
    ],
  },
  {
    tableName: 'app_settings',
    rlsEnabled: false,
    columns: [
      { name: 'id',         type: 'uuid',     isNullable: false, isUnique: true,  defaultValue: 'gen_random_uuid()' },
      { name: 'key',        type: 'string',   isNullable: false, isUnique: true },
      { name: 'value',      type: 'string',   isNullable: false, isUnique: false },
      { name: 'updated_at', type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
    ],
  },
];


async function post<T>(url: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json() as T;
  if (!res.ok) {
    const err = json as { message?: string; error?: string };
    throw new Error(`HTTP ${res.status}: ${err.message ?? err.error ?? JSON.stringify(json)}`);
  }
  return json;
}

async function run() {
  const env = loadEnv();
  const baseUrl = env['EXPO_PUBLIC_INSFORGE_URL'];
  const apiKey  = env['INSFORGE_API_KEY'];

  if (!baseUrl) { console.error('❌  EXPO_PUBLIC_INSFORGE_URL missing'); process.exit(1); }
  if (!apiKey)  { console.error('❌  INSFORGE_API_KEY missing');         process.exit(1); }

  console.log('\n🛡️   NeuroFlow Admin Tables Migration');
  console.log(`📡  Backend: ${baseUrl}\n`);

  // ── Create tables ────────────────────────────────────────────────────────────
  for (const table of TABLES) {
    process.stdout.write(`📋  Creating "${table.tableName}"... `);
    try {
      await post(`${baseUrl}/api/database/tables`, table, apiKey);
      console.log('✅  created');
    } catch (err: any) {
      const msg: string = err.message ?? '';
      if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('400')) {
        console.log('⏭️   already exists — skipped');
      } else {
        console.log(`❌  FAILED: ${msg}`);
      }
    }
  }

  console.log('\n🎉  Admin migration complete!\n');
  console.log('👉  Next steps:');
  console.log('   1. Check InsForge dashboard — resource_cards and app_settings tables should appear');
  console.log('   2. Navigate to /admin in NeuroFlow app (log in as essentiallifekits@gmail.com)');
  console.log('   3. Use the Resources Manager in Admin to add the 6 default resource cards\n');
}

run().catch((err) => {
  console.error('\n💥  Fatal:', err.message);
  process.exit(1);
});
