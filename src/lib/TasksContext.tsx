import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth';
import { getOrCreateProfile, fetchTasks as dbFetchTasks, createTask as dbCreateTask, deleteTask as dbDeleteTask, toggleTask as dbToggleTask, type Task } from './db';

interface TasksContextValue {
  tasks: Task[];
  allScheduledActions: Task[];
  loading: boolean;
  refreshTasks: () => Promise<void>;
  addTask: (task: any) => Promise<string | null>;
  editTask: (taskId: string, taskInput: any) => Promise<void>;
  updateTaskState: (taskId: string, newStatus: any) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
}

// Hide sent tasks only after their scheduled time has passed. Future Resend
// emails mark the row as `sent` when scheduled, so immediate filtering makes
// calendar events vanish seconds after creation.
function filterSentTasks(tasks: Task[], now = new Date()): Task[] {
  const sentGraceMs = 5 * 60 * 1000;
  return tasks.filter((t) => {
    if (t.recurrence_rule !== 'sent') return true;
    const dueMs = getTaskEventTimeMs(t);
    if (dueMs == null) return false;
    return now.getTime() <= dueMs + sentGraceMs;
  });
}

function getTaskEventTimeMs(task: Task): number | null {
  if (!task.due_date) return null;
  const time = task.due_time || '23:59';
  const ms = new Date(`${task.due_date}T${time}:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function filterAllScheduledActions(tasks: Task[], now = new Date()): Task[] {
  const retentionMs = 48 * 60 * 60 * 1000;
  return tasks.filter((t) => {
    if (t.status !== 'pending' && t.status !== 'draft' && t.recurrence_rule !== 'sent') return false;
    const dueMs = getTaskEventTimeMs(t);
    if (dueMs == null) return false;
    if (t.recurrence_rule !== 'sent') return true;
    return now.getTime() <= dueMs + retentionMs;
  });
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allScheduledActions, setAllScheduledActions] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);

  const loadFromCache = async () => {
    try {
      const cached = await AsyncStorage.getItem('@neuroflow_tasks');
      if (cached) {
        const cachedTasks = JSON.parse(cached);
        setTasks(filterSentTasks(cachedTasks));
        setAllScheduledActions(filterAllScheduledActions(cachedTasks));
      }
    } catch {}
  };

  const saveToCache = async (newTasks: Task[]) => {
    try {
      await AsyncStorage.setItem('@neuroflow_tasks', JSON.stringify(newTasks));
    } catch {}
  };

  const loadFromServer = useCallback(async () => {
    if (!profileId) return;
    try {
      // First, retry saving any local-* tasks that failed to persist previously
      const cached = await AsyncStorage.getItem('@neuroflow_tasks').catch(() => null);
      const cachedTasks: Task[] = cached ? JSON.parse(cached) : [];
      const unsynced = cachedTasks.filter((t) => t.id.startsWith('local-'));
      for (const t of unsynced) {
        try {
          await dbCreateTask({ ...t, user_id: profileId });
        } catch {}
      }

      const [d, w, m] = await Promise.all([
        dbFetchTasks(profileId, 'daily'),
        dbFetchTasks(profileId, 'weekly'),
        dbFetchTasks(profileId, 'monthly'),
      ]);
      const rawCombined = [...d, ...w, ...m];
      const combined = filterSentTasks(rawCombined);
      const scheduledActions = filterAllScheduledActions(rawCombined);

      if (rawCombined.length > 0) {
        // Server returned tasks — use authoritative DB data
        setTasks(combined);
        setAllScheduledActions(scheduledActions);
        saveToCache(rawCombined);
      } else if (cachedTasks.length > 0) {
        // Server returned nothing but cache has tasks — keep cache visible.
        // This guards against a transient auth hiccup returning an empty result
        // and silently wiping the user's task list. The cache stays intact and
        // the next successful server fetch will overwrite it correctly.
        setTasks(filterSentTasks(cachedTasks));
        setAllScheduledActions(filterAllScheduledActions(cachedTasks));
      } else {
        // Both server and cache are empty — genuinely no tasks
        setTasks([]);
        setAllScheduledActions([]);
      }
    } catch {
      // If server fails, keep showing cached tasks
    }
  }, [profileId]);

  useEffect(() => {
    if (!user) {
      // Sign-out: clear state but keep the cache so data is visible immediately on next login
      setTasks([]);
      setAllScheduledActions([]);
      setProfileId(null);
      setLoading(false);
      return;
    }
    // Show cached tasks immediately while server fetch runs
    loadFromCache();
    getOrCreateProfile(user.id, user.user_metadata?.full_name ?? user.user_metadata?.name ?? null, user.email)
      .then((p) => {
        setProfileId(p.id);
      })
      .catch(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (profileId) {
      loadFromServer().finally(() => setLoading(false));
    }
  }, [profileId, loadFromServer]);

  // Every 60 seconds, re-filter tasks so sent items disappear from the UI
  // automatically after the email service marks them sent.
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prev => filterSentTasks(prev));
      setAllScheduledActions(prev => filterAllScheduledActions(prev));
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshTasks = async () => {
    await loadFromServer();
  };

  const addTask = async (taskInput: any): Promise<string | null> => {
    // Optimistic cache update
    const tempId = `local-${Date.now()}`;
    const optimisticTask: Task = {
      id: tempId,
      user_id: profileId ?? 'local',
      title: taskInput.title,
      description: taskInput.description,
      view_type: taskInput.view_type || 'daily',
      status: taskInput.status || 'pending',
      priority: taskInput.priority || 1,
      due_date: taskInput.due_date,
      due_time: taskInput.due_time,
      recurrence_rule: taskInput.recurrence_rule || null,
      chore_category: taskInput.chore_category || null,
      sticker_id: taskInput.sticker_id || null,
      completed_at: taskInput.completed_at || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newTasks = [...tasks, optimisticTask];
    setTasks(newTasks);
    setAllScheduledActions(prev => filterAllScheduledActions([...prev, optimisticTask]));
    saveToCache([...allScheduledActions, optimisticTask]);

    if (profileId) {
      try {
        const saved = await dbCreateTask({ ...taskInput, user_id: profileId });
        setTasks((prev) => {
          const updated = prev.map((t) => (t.id === tempId ? saved : t));
          setAllScheduledActions((actions) => {
            const next = filterAllScheduledActions(actions.map((t) => (t.id === tempId ? saved : t)));
            saveToCache(next);
            return next;
          });
          return updated;
        });
        return saved.id;
      } catch (e) {
        console.error('[NeuroFlow] DB save FAILED — entry NOT persisted:', e);
      }
    }
    return tempId;
  };

  const editTask = async (taskId: string, taskInput: any) => {
    // Optimistic cache update for edited fields
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          title: taskInput.title,
          description: taskInput.description,
          due_date: taskInput.due_date,
          due_time: taskInput.due_time,
          chore_category: taskInput.chore_category || t.chore_category,
          sticker_id: taskInput.sticker_id !== undefined ? taskInput.sticker_id : t.sticker_id,
          updated_at: new Date().toISOString()
        };
      }
      return t;
    });

    setTasks(updatedTasks);
    setAllScheduledActions(prev => {
      const updated = filterAllScheduledActions(prev.map(t => t.id === taskId ? { ...t, ...updatedTasks.find(u => u.id === taskId) } : t));
      saveToCache(updated);
      return updated;
    });

    if (profileId && !taskId.startsWith('local-')) {
       // Since the native calendar code deleted then recreated, we will mimic that or do an update
       try {
         await dbDeleteTask(taskId);
         const saved = await dbCreateTask({ ...taskInput, user_id: profileId });
         setTasks(prev => {
            const updated = prev.map(t => t.id === taskId ? saved : t);
            setAllScheduledActions((actions) => {
              const next = filterAllScheduledActions(actions.map(t => t.id === taskId ? saved : t));
              saveToCache(next);
              return next;
            });
            return updated;
         });
       } catch (e) {}
    } else if (profileId && taskId.startsWith('local-')) {
       // Just keep the local update since it's already updated in DB if needed (or not saved to DB).
    }
  };

  const updateTaskState = async (taskId: string, newStatus: any) => {
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null } : t);
    setTasks(updatedTasks);
    setAllScheduledActions(prev => {
      const updated = filterAllScheduledActions(prev.map(t => t.id === taskId ? { ...t, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null } : t));
      saveToCache(updated);
      return updated;
    });

    if (profileId && !taskId.startsWith('local-')) {
      try { await dbToggleTask(taskId, newStatus === 'completed' ? 'pending' : 'completed'); } catch {}
    }
  };

  const removeTask = async (taskId: string) => {
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    setTasks(updatedTasks);
    setAllScheduledActions(prev => {
      const updated = prev.filter(t => t.id !== taskId);
      saveToCache(updated);
      return updated;
    });

    if (profileId && !taskId.startsWith('local-')) {
      try { await dbDeleteTask(taskId); } catch {}
    }
  };

  return (
    <TasksContext.Provider value={{ tasks, allScheduledActions, loading, refreshTasks, addTask, editTask, updateTaskState, removeTask }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used inside <TasksProvider>');
  return ctx;
}
