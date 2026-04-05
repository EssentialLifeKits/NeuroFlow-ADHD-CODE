/**
 * NeuroFlow — Admin Database Layer
 * Handles resources, email config, and app settings
 * stored in InsForge database tables.
 */

import { insforge } from './insforge';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResourceCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  icon_bg: string;
  accent_color: string;
  link: string;
  link_label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppSetting {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

// ─── Resource Cards ───────────────────────────────────────────────────────────

export async function fetchResourceCards(): Promise<ResourceCard[]> {
  const { data, error } = await insforge.database
    .from('resource_cards')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ResourceCard[];
}

export async function fetchAllResourceCards(): Promise<ResourceCard[]> {
  const { data, error } = await insforge.database
    .from('resource_cards')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ResourceCard[];
}

export async function createResourceCard(card: Omit<ResourceCard, 'id' | 'created_at' | 'updated_at'>): Promise<ResourceCard> {
  const { data, error } = await insforge.database
    .from('resource_cards')
    .insert(card)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ResourceCard;
}

export async function updateResourceCard(id: string, card: Partial<Omit<ResourceCard, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await insforge.database
    .from('resource_cards')
    .update({ ...card, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteResourceCard(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('resource_cards')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ─── App Settings (email config, blueprint link, audio link, etc.) ────────────

export async function getSetting(key: string): Promise<string | null> {
  const { data, error } = await insforge.database
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) return null;
  return (data as any)?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  // Upsert — insert or update
  const existing = await getSetting(key);
  if (existing !== null) {
    const { error } = await insforge.database
      .from('app_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await insforge.database
      .from('app_settings')
      .insert({ key, value });
    if (error) throw new Error(error.message);
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const { data, error } = await insforge.database
    .from('app_settings')
    .select('*');

  if (error) return {};
  const result: Record<string, string> = {};
  for (const row of (data ?? []) as AppSetting[]) {
    result[row.key] = row.value;
  }
  return result;
}
