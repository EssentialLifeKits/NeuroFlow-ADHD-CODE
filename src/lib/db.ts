/**
 * NeuroFlow — Supabase Data Access Layer
 * Typed wrappers around supabase for:
 *   - User profiles (users table)
 *   - Tasks (daily / weekly / monthly calendar entries)
 *   - Focus sessions (Hyperfocus Lotus)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ViewType   = 'daily' | 'weekly' | 'monthly';
export type TaskStatus = 'pending' | 'completed' | 'draft';
export type SessionType   = 'focus' | 'short_break' | 'long_break';
export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface UserProfile {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  view_type: ViewType;
  status: TaskStatus;
  priority: 1 | 2 | 3;
  due_date: string | null;
  due_time: string | null;
  recurrence_rule: string | null;
  chore_category: string | null;
  sticker_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FocusSession {
  id: string;
  user_id: string;
  task_id: string | null;
  label: string | null;
  session_type: SessionType;
  planned_duration_min: number;
  actual_duration_min: number | null;
  status: SessionStatus;
  mood_before: number | null;
  mood_after: number | null;
  notes: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

const FOCUS_SESSIONS_CACHE_KEY = '@neuroflow_focus_sessions';

async function readCachedFocusSessions(profileId?: string): Promise<FocusSession[]> {
  try {
    const cached = await AsyncStorage.getItem(FOCUS_SESSIONS_CACHE_KEY);
    const parsed: FocusSession[] = cached ? JSON.parse(cached) : [];
    return profileId ? parsed.filter((s) => s.user_id === profileId) : parsed;
  } catch {
    return [];
  }
}

async function writeCachedFocusSessions(sessions: FocusSession[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FOCUS_SESSIONS_CACHE_KEY, JSON.stringify(sessions));
  } catch {}
}

function mergeFocusSessions(primary: FocusSession[], fallback: FocusSession[]): FocusSession[] {
  const map = new Map<string, FocusSession>();
  fallback.forEach((s) => map.set(s.id, s));
  primary.forEach((s) => map.set(s.id, s));
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
}

export async function upsertCachedFocusSession(session: FocusSession): Promise<void> {
  const cached = await readCachedFocusSessions();
  await writeCachedFocusSessions(mergeFocusSessions([session], cached));
}

async function updateCachedFocusSession(sessionId: string, patch: Partial<FocusSession>): Promise<void> {
  const cached = await readCachedFocusSessions();
  if (!cached.some((s) => s.id === sessionId)) return;
  await writeCachedFocusSessions(
    cached.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
  );
}

async function removeCachedFocusSession(sessionId: string): Promise<void> {
  const cached = await readCachedFocusSessions();
  await writeCachedFocusSessions(cached.filter((s) => s.id !== sessionId));
}

// ─── User Profiles ────────────────────────────────────────────────────────────

export async function getOrCreateProfile(
  authUserId: string,
  displayName?: string | null,
  email?: string | null,
): Promise<UserProfile> {
  const { data: existing, error: fetchErr } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (existing) return existing as UserProfile;

  const { data: created, error: insertErr } = await supabase
    .from('users')
    .insert({
      id: authUserId,
      auth_user_id: authUserId,
      email: email ?? '',
      display_name: displayName ?? null,
    })
    .select()
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return created as UserProfile;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function fetchTasks(profileId: string, viewType: ViewType): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', profileId)
    .eq('view_type', viewType)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function createTask(
  task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'description' | 'due_date' | 'due_time' | 'recurrence_rule' | 'chore_category' | 'sticker_id' | 'completed_at'> &
    Partial<Pick<Task, 'description' | 'due_date' | 'due_time' | 'recurrence_rule' | 'chore_category' | 'sticker_id'>>,
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Task;
}

export async function toggleTask(taskId: string, currentStatus: TaskStatus): Promise<void> {
  const newStatus: TaskStatus = currentStatus === 'completed' ? 'pending' : 'completed';
  const { error } = await supabase
    .from('tasks')
    .update({
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

// ─── Focus Sessions ───────────────────────────────────────────────────────────

export async function createFocusSession(
  session: Omit<FocusSession, 'id' | 'created_at' | 'task_id' | 'label' | 'actual_duration_min' | 'mood_before' | 'mood_after' | 'notes' | 'ended_at'> &
    Partial<Pick<FocusSession, 'task_id' | 'label' | 'mood_before'>>,
): Promise<FocusSession> {
  const { data, error } = await supabase
    .from('focus_sessions')
    .insert(session)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await upsertCachedFocusSession(data as FocusSession);
  return data as FocusSession;
}

export async function completeFocusSession(
  sessionId: string,
  actualDurationMin: number,
  moodAfter?: number,
  notes?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('focus_sessions')
    .update({
      status: 'completed',
      actual_duration_min: actualDurationMin,
      mood_after: moodAfter ?? null,
      notes: notes ?? null,
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
  await updateCachedFocusSession(sessionId, {
    status: 'completed',
    actual_duration_min: actualDurationMin,
    mood_after: moodAfter ?? null,
    notes: notes ?? null,
    ended_at: new Date().toISOString(),
  });
}

export async function abandonFocusSession(
  sessionId: string,
  actualDurationMin: number,
  moodAfter?: number,
  notes?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('focus_sessions')
    .update({
      status: 'abandoned',
      actual_duration_min: actualDurationMin,
      mood_after: moodAfter ?? null,
      notes: notes ?? null,
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
  await updateCachedFocusSession(sessionId, {
    status: 'abandoned',
    actual_duration_min: actualDurationMin,
    mood_after: moodAfter ?? null,
    notes: notes ?? null,
    ended_at: new Date().toISOString(),
  });
}

export async function fetchAllSessions(profileId: string): Promise<FocusSession[]> {
  const cached = await readCachedFocusSessions(profileId);
  try {
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', profileId)
      .order('started_at', { ascending: false });

    if (error) throw new Error(error.message);
    const merged = mergeFocusSessions((data ?? []) as FocusSession[], cached);
    if (merged.length > 0) await writeCachedFocusSessions(mergeFocusSessions(merged, await readCachedFocusSessions()));
    return merged;
  } catch {
    return cached;
  }
}

export async function updateSessionNote(sessionId: string, notes: string | null): Promise<void> {
  const { error } = await supabase
    .from('focus_sessions')
    .update({ notes: notes ?? null })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
  await updateCachedFocusSession(sessionId, { notes: notes ?? null });
}

export async function deleteFocusSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('focus_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
  await removeCachedFocusSession(sessionId);
}

// Returns "YYYY-MM-DD" in local time
function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function fetchTodaysSessions(profileId: string): Promise<FocusSession[]> {
  const todayStr = localDateString(new Date());
  const allSessions = await fetchAllSessions(profileId);
  return allSessions.filter(
    (s) => localDateString(new Date(s.started_at)) === todayStr,
  );
}

export async function fetchWeekSessions(profileId: string): Promise<FocusSession[]> {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const mondayStr = localDateString(monday);

  const allSessions = await fetchAllSessions(profileId);
  return allSessions.filter(
    (s) => localDateString(new Date(s.started_at)) >= mondayStr,
  );
}
