import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth';
import { getOrCreateProfile, fetchTasks as dbFetchTasks, createTask as dbCreateTask, deleteTask as dbDeleteTask, toggleTask as dbToggleTask, type Task } from './db';

interface TasksContextValue {
  tasks: Task[];
  loading: boolean;
  refreshTasks: () => Promise<void>;
  addTask: (task: any) => Promise<void>;
  editTask: (taskId: string, taskInput: any) => Promise<void>;
  updateTaskState: (taskId: string, newStatus: any) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);

  const loadFromCache = async () => {
    try {
      const cached = await AsyncStorage.getItem('@neuroflow_tasks');
      if (cached) setTasks(JSON.parse(cached));
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
      const [d, w, m] = await Promise.all([
        dbFetchTasks(profileId, 'daily'),
        dbFetchTasks(profileId, 'weekly'),
        dbFetchTasks(profileId, 'monthly'),
      ]);
      const combined = [...d, ...w, ...m];
      setTasks(combined);
      saveToCache(combined);
    } catch {
       // if server fails, keep cache
    }
  }, [profileId]);

  useEffect(() => {
    loadFromCache();
    if (!user) {
      setLoading(false);
      return;
    }
    getOrCreateProfile(user.id, (user as any).displayName, (user as any).email)
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

  const refreshTasks = async () => {
    await loadFromServer();
  };

  const addTask = async (taskInput: any) => {
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
    saveToCache(newTasks);

    if (profileId) {
      try {
        const saved = await dbCreateTask({ ...taskInput, user_id: profileId });
        setTasks((prev) => {
          const updated = prev.map((t) => (t.id === tempId ? saved : t));
          saveToCache(updated);
          return updated;
        });
      } catch (e) {
        // If DB fails (like Dev Bypass RLS issue), task remains locally in AsyncStorage!
      }
    }
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
    saveToCache(updatedTasks);

    if (profileId && !taskId.startsWith('local-')) {
       // Since the native calendar code deleted then recreated, we will mimic that or do an update
       try {
         await dbDeleteTask(taskId);
         const saved = await dbCreateTask({ ...taskInput, user_id: profileId });
         setTasks(prev => {
            const updated = prev.map(t => t.id === taskId ? saved : t);
            saveToCache(updated);
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
    saveToCache(updatedTasks);

    if (profileId && !taskId.startsWith('local-')) {
      try { await dbToggleTask(taskId, newStatus === 'completed' ? 'pending' : 'completed'); } catch {}
    }
  };

  const removeTask = async (taskId: string) => {
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    setTasks(updatedTasks);
    saveToCache(updatedTasks);

    if (profileId && !taskId.startsWith('local-')) {
      try { await dbDeleteTask(taskId); } catch {}
    }
  };

  return (
    <TasksContext.Provider value={{ tasks, loading, refreshTasks, addTask, editTask, updateTaskState, removeTask }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used inside <TasksProvider>');
  return ctx;
}
