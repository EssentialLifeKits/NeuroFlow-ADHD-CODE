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

const SEED_CARDS = [
  { title: 'Deep Work Blueprint',    description: 'Science-backed protocols for ADHD deep focus — no willpower required.',             icon: '📘', icon_bg: 'rgba(74,144,226,0.12)',   accent_color: '#4A90E2', link: 'https://neuroflow.app/deep-work-blueprint', link_label: 'Download Free →',    sort_order: 0, is_active: true },
  { title: 'Focus Timer Templates',  description: 'Pre-built Pomodoro + body-doubling schedules tuned for ADHD brains.',              icon: '⏱',  icon_bg: 'rgba(52,211,153,0.12)',    accent_color: '#34D399', link: '#',                                         link_label: 'Explore Templates →', sort_order: 1, is_active: true },
  { title: 'Task Batching System',   description: 'Group your tasks into energy-matched batches so decisions are eliminated.',         icon: '📋', icon_bg: 'rgba(251,146,60,0.12)',    accent_color: '#FB923C', link: '#',                                         link_label: 'Get the System →',   sort_order: 2, is_active: true },
  { title: 'ADHD Habit Stacker',     description: 'Anchor new routines to existing ones — build habits without constant reminders.', icon: '🔗', icon_bg: 'rgba(248,113,113,0.12)',   accent_color: '#F87171', link: '#',                                         link_label: 'Learn More →',       sort_order: 3, is_active: true },
  { title: 'Brain Dump Toolkit',     description: 'Capture every thought, idea, and obligation into a trusted external system.',      icon: '🧠', icon_bg: 'rgba(74,144,226,0.08)',    accent_color: '#4A90E2', link: '#',                                         link_label: 'Get Toolkit →',      sort_order: 4, is_active: true },
  { title: 'Productivity Analytics', description: 'Track focus streaks, energy patterns, and see your real daily output.',            icon: '📊', icon_bg: 'rgba(96,165,250,0.12)',    accent_color: '#60A5FA', link: '#',                                         link_label: 'Track Progress →',   sort_order: 5, is_active: true },
];

const SEED_SETTINGS = [
  { key: 'from_email',         value: 'NeuroFlow ADHD <reminders@keepzbrandai.com>' },
  { key: 'blueprint_link',     value: 'https://neuroflow.app/deep-work-blueprint' },
  { key: 'audio_link',         value: '' },
  { key: 'email_subject_task', value: '🎯 Now: {{title}}' },
  { key: 'email_subject_reminder', value: '⏰ Reminder: {{title}}' },
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

  // ── Seed resource_cards ───────────────────────────────────────────────────────
  console.log('\n🌱  Seeding resource_cards...');
  for (const card of SEED_CARDS) {
    process.stdout.write(`   → "${card.title}"... `);
    try {
      await post(`${baseUrl}/api/database/records/resource_cards`, card, apiKey);
      console.log('✅');
    } catch (err: any) {
      console.log(`⚠️   ${err.message}`);
    }
  }

  // ── Seed app_settings ─────────────────────────────────────────────────────────
  console.log('\n⚙️   Seeding app_settings...');
  for (const setting of SEED_SETTINGS) {
    process.stdout.write(`   → "${setting.key}"... `);
    try {
      await post(`${baseUrl}/api/database/records/app_settings`, setting, apiKey);
      console.log('✅');
    } catch (err: any) {
      console.log(`⚠️   ${err.message}`);
    }
  }

  console.log('\n🎉  Admin migration complete!\n');
  console.log('👉  Next steps:');
  console.log('   1. Check InsForge dashboard — resource_cards and app_settings tables should appear');
  console.log('   2. Navigate to /admin in NeuroFlow app to manage content\n');
}

run().catch((err) => {
  console.error('\n💥  Fatal:', err.message);
  process.exit(1);
});
