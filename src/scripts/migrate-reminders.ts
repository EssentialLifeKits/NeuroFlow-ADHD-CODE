/**
 * NeuroFlow — Add reminder_offset column to tasks table
 * Run with: npm run migrate:reminders
 */

import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
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

async function run() {
  const env = loadEnv();
  const baseUrl = env['EXPO_PUBLIC_INSFORGE_URL'];
  const apiKey  = env['INSFORGE_API_KEY'];

  if (!baseUrl || !apiKey) {
    console.error('❌  Missing EXPO_PUBLIC_INSFORGE_URL or INSFORGE_API_KEY');
    process.exit(1);
  }

  console.log('\n🌸  NeuroFlow — Reminder Migration');
  console.log(`📡  Backend: ${baseUrl}\n`);

  // Add reminder_offset column to tasks table
  // Values: 'none' | 'at_time' | '1h_before' | '1d_before'
  const column = {
    name: 'reminder_offset',
    type: 'string',
    isNullable: true,
    isUnique: false,
    defaultValue: 'none',
  };

  process.stdout.write(`📋  Adding column "reminder_offset" to tasks... `);
  try {
    const res = await fetch(`${baseUrl}/api/database/tables/tasks/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(column),
    });
    const json = await res.json() as any;
    if (!res.ok) {
      const msg = json.message ?? json.error ?? JSON.stringify(json);
      if (msg.includes('already exists') || msg.includes('duplicate') || res.status === 400) {
        console.log('⏭️   already exists — skipped');
      } else {
        console.log(`❌  FAILED: ${msg}`);
      }
    } else {
      console.log(`✅  Done`);
    }
  } catch (err: any) {
    console.log(`❌  ${err.message}`);
  }

  console.log('\n🎉  Reminder migration complete\n');
}

run().catch((err) => {
  console.error('\n💥  Fatal error:', err.message);
  process.exit(1);
});
