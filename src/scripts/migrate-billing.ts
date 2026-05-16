/**
 * NeuroFlow — Billing Migration
 * Creates the subscriptions table used by Stripe webhooks and the in-app paywall.
 *
 * Usage:
 *   npx ts-node --project tsconfig.node.json src/scripts/migrate-billing.ts
 */

import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;

  const raw = fs.readFileSync(envPath, 'utf-8');
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

const TABLE: CreateTableRequest = {
  tableName: 'subscriptions',
  rlsEnabled: true,
  columns: [
    { name: 'id', type: 'uuid', isNullable: false, isUnique: true, defaultValue: 'gen_random_uuid()' },
    { name: 'user_email', type: 'string', isNullable: false, isUnique: true },
    { name: 'user_id', type: 'uuid', isNullable: true, isUnique: false },
    { name: 'stripe_customer_id', type: 'string', isNullable: true, isUnique: false },
    { name: 'stripe_subscription_id', type: 'string', isNullable: true, isUnique: true },
    { name: 'status', type: 'string', isNullable: false, isUnique: false, defaultValue: 'inactive' },
    { name: 'price_id', type: 'string', isNullable: true, isUnique: false },
    { name: 'current_period_end', type: 'datetime', isNullable: true, isUnique: false },
    { name: 'cancel_at_period_end', type: 'boolean', isNullable: false, isUnique: false, defaultValue: 'false' },
    { name: 'created_at', type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
    { name: 'updated_at', type: 'datetime', isNullable: false, isUnique: false, defaultValue: 'now()' },
  ],
};

async function post<T>(url: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
  const env = { ...process.env, ...loadEnv() };
  const baseUrl = env.EXPO_PUBLIC_INSFORGE_URL;
  const apiKey = env.INSFORGE_API_KEY;

  if (!baseUrl) throw new Error('EXPO_PUBLIC_INSFORGE_URL missing');
  if (!apiKey) throw new Error('INSFORGE_API_KEY missing');

  process.stdout.write('💳 Creating "subscriptions" table... ');
  try {
    await post(`${baseUrl}/api/database/tables`, TABLE, apiKey);
    console.log('✅ created');
  } catch (err: any) {
    const msg: string = err.message ?? '';
    if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('400')) {
      console.log('⏭️ already exists — skipped');
      return;
    }
    throw err;
  }
}

run().catch((err) => {
  console.error('\n💥 Billing migration failed:', err.message);
  process.exit(1);
});
