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

  const saveToCache = async (newTasks: Task[]) => {
    try {
      await AsyncStorage.setItem('@neuroflow_tasks', JSON.stringify(newTasks));
    } catch {}
  };

  const loadFromServer = useCallback(async (pid?: string) => {
    const id = pid ?? profileId;
    if (!id) return;
    const [d, w, m] = await Promise.all([
      dbFetchTasks(id, 'daily'),
      dbFetchTasks(id, 'weekly'),
      dbFetchTasks(id, 'monthly'),
    ]);
    const combined = [...d, ...w, ...m];
    setTasks(combined);
    saveToCache(combined);
  }, [profileId]);

  useEffect(() => {
    if (!user) {
      // User signed out — clear everything so stale entries never appear on next login
      setTasks([]);
      setProfileId(null);
      AsyncStorage.removeItem('@neuroflow_tasks').catch(() => {});
      setLoading(false);
      return;
    }

    setLoading(true);
    getOrCreateProfile(user.id, (user as any).displayName, (user as any).email)
      .then(async (p) => {
        setProfileId(p.id);
        // Always load fresh from server on login — never rely solely on cache
        try {
          await loadFromServer(p.id);
        } catch {
          // Server failed — try loading from cache as fallback
          try {
            const cached = await AsyncStorage.getItem('@neuroflow_tasks');
            if (cached) setTasks(JSON.parse(cached));
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const refreshTasks = async () => {
    try {
      await loadFromServer();
    } catch {}
  };

  // addTask throws if the database save fails — caller must handle and alert the user
  const addTask = async (taskInput: any) => {
    if (!profileId) throw new Error('Not signed in — please sign in and try again.');

    const saved = await dbCreateTask({ ...taskInput, user_id: profileId });
    setTasks((prev) => {
      const updated = [...prev, saved];
      saveToCache(updated);
      return updated;
    });
  };

  // editTask throws if the database save fails — caller must handle and alert the user
  const editTask = async (taskId: string, taskInput: any) => {
    if (!profileId) throw new Error('Not signed in — please sign in and try again.');

    if (taskId.startsWith('local-')) {
      // This was a locally-only task — save it properly to DB now
      const saved = await dbCreateTask({ ...taskInput, user_id: profileId });
      setTasks(prev => {
        const updated = prev.map(t => t.id === taskId ? saved : t);
        saveToCache(updated);
        return updated;
      });
      return;
    }

    // Delete old record and insert updated one (preserves existing behaviour)
    await dbDeleteTask(taskId);
    const saved = await dbCreateTask({ ...taskInput, user_id: profileId });
    setTasks(prev => {
      const updated = prev.map(t => t.id === taskId ? saved : t);
      saveToCache(updated);
      return updated;
    });
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
