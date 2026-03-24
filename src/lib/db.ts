/**
 * NeuroFlow — InsForge Data Access Layer
 * ---------------------------------------
 * Typed wrappers around insforge.database for:
 *   - User profiles (users table — links auth user → app user)
 *   - Tasks (daily / weekly / monthly calendar entries)
 *   - Focus sessions (Hyperfocus Lotus)
 */

import { insforge } from './insforge';

// ─── Shared types ────────────────────────────────────────────────────────────

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

// ─── User Profiles ────────────────────────────────────────────────────────────

/**
 * Returns the app-level user profile for the given InsForge auth user ID.
 * Creates one on the first login so the FK references in tasks/sessions work.
 */
export async function getOrCreateProfile(
  authUserId: string,
  displayName?: string | null,
  email?: string | null,
): Promise<UserProfile> {
  // Try to fetch existing profile
  const { data: existing, error: fetchErr } = await insforge.database
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (existing) return existing as UserProfile;

  // Create profile on first login — id MUST equal authUserId so tasks RLS (auth.uid() = user_id) works
  const { data: created, error: insertErr } = await insforge.database
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

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function fetchTasks(profileId: string, viewType: ViewType): Promise<Task[]> {
  const { data, error } = await insforge.database
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
  const { data, error } = await insforge.database
    .from('tasks')
    .insert(task)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Task;
}

export async function toggleTask(taskId: string, currentStatus: TaskStatus): Promise<void> {
  const newStatus: TaskStatus = currentStatus === 'completed' ? 'pending' : 'completed';
  const { error } = await insforge.database
    .from('tasks')
    .update({
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await insforge.database
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
  const { data, error } = await insforge.database
    .from('focus_sessions')
    .insert(session)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as FocusSession;
}

export async function completeFocusSession(
  sessionId: string,
  actualDurationMin: number,
  moodAfter?: number,
  notes?: string | null,
): Promise<void> {
  const { error } = await insforge.database
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
}

export async function abandonFocusSession(
  sessionId: string,
  actualDurationMin: number,
  moodAfter?: number,
  notes?: string | null,
): Promise<void> {
  const { error } = await insforge.database
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
}

export async function fetchAllSessions(profileId: string): Promise<FocusSession[]> {
  const { data, error } = await insforge.database
    .from('focus_sessions')
    .select('*')
    .eq('user_id', profileId)
    .order('started_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as FocusSession[];
}

export async function updateSessionNote(sessionId: string, notes: string | null): Promise<void> {
  const { error } = await insforge.database
    .from('focus_sessions')
    .update({ notes: notes ?? null })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
}

export async function deleteFocusSession(sessionId: string): Promise<void> {
  const { error } = await insforge.database
    .from('focus_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
}

export async function fetchTodaysSessions(profileId: string): Promise<FocusSession[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await insforge.database
    .from('focus_sessions')
    .select('*')
    .eq('user_id', profileId)
    .gte('started_at', today.toISOString())
    .order('started_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as FocusSession[];
}
