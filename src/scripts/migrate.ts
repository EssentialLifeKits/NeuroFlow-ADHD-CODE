/**
 * NeuroFlow — InsForge Database Migration
 * ----------------------------------------
 * Creates the four core tables for the ADHD app:
 *   - users         (Google OAuth profile mirror)
 *   - tasks         (Daily/Weekly/Monthly calendar entries)
 *   - focus_sessions (Hyperfocus Lotus sessions)
 *   - habits        (Automated habit tracking)
 *
 * Usage:
 *   npx ts-node src/scripts/migrate.ts
 *
 * Required env vars (in NeuroFlow/.env):
 *   EXPO_PUBLIC_INSFORGE_URL
 *   INSFORGE_ADMIN_EMAIL
 *   INSFORGE_ADMIN_PASSWORD
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Env loader (simple, no dotenv dependency needed)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env file not found at', envPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

// ---------------------------------------------------------------------------
// Types matching InsForge database-api.schema
// ---------------------------------------------------------------------------
type ColumnType = 'string' | 'integer' | 'float' | 'boolean' | 'uuid' | 'json' | 'date' | 'datetime';

interface ColumnDef {
  name: string;
  type: ColumnType;
  isNullable: boolean;
  isUnique: boolean;
  defaultValue?: string;
  foreignKey?: {
    referenceTable: string;
    referenceColumn: string;
    onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate: 'CASCADE' | 'RESTRICT' | 'NO ACTION';
  };
}

interface CreateTableRequest {
  tableName: string;
  columns: ColumnDef[];
  rlsEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------
const TABLES: CreateTableRequest[] = [
  /**
   * users — mirrors the Google OAuth profile returned by InsForge auth.
   * InsForge auto-manages its own auth.users internally; this table stores
   * app-level profile data keyed to the same user UUID.
   */
  {
    tableName: 'users',
    rlsEnabled: true,
    columns: [
      { name: 'id',            type: 'uuid',     isNullable: false, isUnique: true,  defaultValue: 'gen_random_uuid()' },
      { name: 'auth_user_id',  type: 'uuid',     isNullable: false, isUnique: true  },
      { name: 'email',         type: 'string',   isNullable: false, isUnique: true  },
      { name: 'display_name',  type: 'string',   isNullable: true,  isUnique: false },
      { name: 'avatar_url',    type: 'string',   isNullable: true,  isUnique: false },
      { name: 'timezone',      type: 'string',   isNullable: true,  isUnique: false, defaultValue: 'UTC' },
      { name: 'onboarded',     type: 'boolean',  isNullable: false, isUnique: false, defaultValue: 'false' },
      { name: 'created_at',    type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
      { name: 'updated_at',    type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
    ],
  },

  /**
   * tasks — unified data persistence for Daily/Weekly/Monthly calendar views.
   * `view_type` drives which calendar panel renders the task.
   * `recurrence_rule` is an iCal RRULE string (e.g. "FREQ=DAILY;COUNT=7").
   */
  {
    tableName: 'tasks',
    rlsEnabled: true,
    columns: [
      { name: 'id',               type: 'uuid',     isNullable: false, isUnique: true,  defaultValue: 'gen_random_uuid()' },
      { name: 'user_id',          type: 'uuid',     isNullable: false, isUnique: false,
        foreignKey: { referenceTable: 'users', referenceColumn: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      { name: 'title',            type: 'string',   isNullable: false, isUnique: false },
      { name: 'description',      type: 'string',   isNullable: true,  isUnique: false },
      // 'daily' | 'weekly' | 'monthly' — controls which calendar view owns the task
      { name: 'view_type',        type: 'string',   isNullable: false, isUnique: false, defaultValue: 'daily' },
      { name: 'status',           type: 'string',   isNullable: false, isUnique: false, defaultValue: 'pending' },
      // Priority 1 (low) – 3 (high)
      { name: 'priority',         type: 'integer',  isNullable: false, isUnique: false, defaultValue: '2' },
      { name: 'due_date',         type: 'date',     isNullable: true,  isUnique: false },
      { name: 'due_time',         type: 'string',   isNullable: true,  isUnique: false },
      // iCal RRULE for recurring tasks
      { name: 'recurrence_rule',  type: 'string',   isNullable: true,  isUnique: false },
      // For Chore Chopper: assigns task to a chore category
      { name: 'chore_category',   type: 'string',   isNullable: true,  isUnique: false },
      // Sticker assigned to this task (Step 5: Sticker Tray)
      { name: 'sticker_id',       type: 'string',   isNullable: true,  isUnique: false },
      { name: 'completed_at',     type: 'datetime', isNullable: true,  isUnique: false },
      { name: 'created_at',       type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
      { name: 'updated_at',       type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
    ],
  },

  /**
   * focus_sessions — powers the Hyperfocus Lotus (Step 4).
   * Tracks structured deep-work blocks with duration and completion state.
   */
  {
    tableName: 'focus_sessions',
    rlsEnabled: true,
    columns: [
      { name: 'id',                  type: 'uuid',     isNullable: false, isUnique: true,  defaultValue: 'gen_random_uuid()' },
      { name: 'user_id',             type: 'uuid',     isNullable: false, isUnique: false,
        foreignKey: { referenceTable: 'users', referenceColumn: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      // Optional link to the task being worked on
      { name: 'task_id',             type: 'uuid',     isNullable: true,  isUnique: false,
        foreignKey: { referenceTable: 'tasks', referenceColumn: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      { name: 'label',               type: 'string',   isNullable: true,  isUnique: false },
      // 'focus' | 'short_break' | 'long_break'
      { name: 'session_type',        type: 'string',   isNullable: false, isUnique: false, defaultValue: 'focus' },
      { name: 'planned_duration_min',type: 'integer',  isNullable: false, isUnique: false, defaultValue: '25' },
      { name: 'actual_duration_min', type: 'integer',  isNullable: true,  isUnique: false },
      // 'active' | 'completed' | 'abandoned'
      { name: 'status',              type: 'string',   isNullable: false, isUnique: false, defaultValue: 'active' },
      { name: 'mood_before',         type: 'integer',  isNullable: true,  isUnique: false },
      { name: 'mood_after',          type: 'integer',  isNullable: true,  isUnique: false },
      { name: 'notes',               type: 'string',   isNullable: true,  isUnique: false },
      { name: 'started_at',          type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
      { name: 'ended_at',            type: 'datetime', isNullable: true,  isUnique: false },
      { name: 'created_at',          type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
    ],
  },

  /**
   * habits — automated habit icon tracking (Step 4 / 5).
   * Each row is one habit definition; completions are tracked via habit_logs (JSON
   * packed into `completion_log` for simplicity at this stage).
   */
  {
    tableName: 'habits',
    rlsEnabled: true,
    columns: [
      { name: 'id',               type: 'uuid',     isNullable: false, isUnique: true,  defaultValue: 'gen_random_uuid()' },
      { name: 'user_id',          type: 'uuid',     isNullable: false, isUnique: false,
        foreignKey: { referenceTable: 'users', referenceColumn: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      { name: 'name',             type: 'string',   isNullable: false, isUnique: false },
      { name: 'description',      type: 'string',   isNullable: true,  isUnique: false },
      // Emoji or icon identifier for the automated habit icon (Step 5)
      { name: 'icon',             type: 'string',   isNullable: true,  isUnique: false, defaultValue: '⭐' },
      { name: 'color',            type: 'string',   isNullable: true,  isUnique: false, defaultValue: '#4A90D9' },
      // 'daily' | 'weekly'
      { name: 'frequency',        type: 'string',   isNullable: false, isUnique: false, defaultValue: 'daily' },
      // Days of week bitmask (0=Sun … 6=Sat) stored as JSON array e.g. [1,2,3,4,5]
      { name: 'target_days',      type: 'json',     isNullable: true,  isUnique: false },
      { name: 'target_count',     type: 'integer',  isNullable: false, isUnique: false, defaultValue: '1' },
      // Rolling streak counter (updated by app logic)
      { name: 'current_streak',   type: 'integer',  isNullable: false, isUnique: false, defaultValue: '0' },
      { name: 'longest_streak',   type: 'integer',  isNullable: false, isUnique: false, defaultValue: '0' },
      { name: 'last_completed_at',type: 'datetime', isNullable: true,  isUnique: false },
      { name: 'is_archived',      type: 'boolean',  isNullable: false, isUnique: false, defaultValue: 'false' },
      { name: 'created_at',       type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
      { name: 'updated_at',       type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
    ],
  },
];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function post<T>(url: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json() as T;

  if (!res.ok) {
    const err = json as { message?: string; error?: string };
    throw new Error(`HTTP ${res.status}: ${err.message ?? err.error ?? JSON.stringify(json)}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------
async function run() {
  const env = loadEnv();

  const baseUrl = env['EXPO_PUBLIC_INSFORGE_URL'];
  const apiKey  = env['INSFORGE_API_KEY'];

  if (!baseUrl) { console.error('❌  EXPO_PUBLIC_INSFORGE_URL missing from .env'); process.exit(1); }
  if (!apiKey)  { console.error('❌  INSFORGE_API_KEY missing from .env');         process.exit(1); }

  console.log(`\n🌸  NeuroFlow Database Migration`);
  console.log(`📡  Backend: ${baseUrl}\n`);
  console.log('🔑  Using API key auth\n');

  // Create tables
  let created = 0;
  let skipped = 0;

  for (const table of TABLES) {
    process.stdout.write(`📋  Creating table "${table.tableName}"... `);
    try {
      const result = await post<{ message: string; tableName: string }>(
        `${baseUrl}/api/database/tables`,
        table,
        apiKey,
      );
      console.log(`✅  ${result.message}`);
      created++;
    } catch (err: any) {
      const msg: string = err.message ?? '';
      // InsForge returns 400 if the table already exists
      if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('400')) {
        console.log('⏭️   already exists — skipped');
        skipped++;
      } else {
        console.log(`❌  FAILED: ${msg}`);
      }
    }
  }

  console.log(`\n🎉  Migration complete: ${created} created, ${skipped} skipped`);
  console.log('👉  Next: run the app and complete Google OAuth to auto-populate users table\n');
}

run().catch((err) => {
  console.error('\n💥  Fatal migration error:', err.message);
  process.exit(1);
});
