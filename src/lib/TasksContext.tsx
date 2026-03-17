import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
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
  // Ref instead of state — addTask/editTask always get latest value without stale closures
  const profileIdRef = useRef<string | null>(null);

  const saveToCache = (newTasks: Task[]) => {
    AsyncStorage.setItem('@neuroflow_tasks', JSON.stringify(newTasks)).catch(() => {});
  };

  const fetchAndSetTasks = async (pid: string) => {
    const [d, w, m] = await Promise.all([
      dbFetchTasks(pid, 'daily'),
      dbFetchTasks(pid, 'weekly'),
      dbFetchTasks(pid, 'monthly'),
    ]);
    const combined = [...d, ...w, ...m];
    setTasks(combined);
    saveToCache(combined);
  };

  useEffect(() => {
    if (!user) {
      // User signed out — wipe everything
      setTasks([]);
      profileIdRef.current = null;
      AsyncStorage.removeItem('@neuroflow_tasks').catch(() => {});
      setLoading(false);
      return;
    }

    setLoading(true);
    getOrCreateProfile(user.id, (user as any).displayName, (user as any).email)
      .then(async (p) => {
        profileIdRef.current = p.id;
        try {
          await fetchAndSetTasks(p.id);
        } catch {
          // Server failed — load cache as fallback so user sees something
          try {
            const cached = await AsyncStorage.getItem('@neuroflow_tasks');
            if (cached) setTasks(JSON.parse(cached));
          } catch {}
        }
      })
      .catch((err) => {
        console.error('[TasksContext] getOrCreateProfile failed:', err);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const refreshTasks = useCallback(async () => {
    const pid = profileIdRef.current;
    if (!pid) return;
    try { await fetchAndSetTasks(pid); } catch {}
  }, []);

  // addTask throws on failure so the caller can alert the user
  const addTask = useCallback(async (taskInput: any) => {
    const pid = profileIdRef.current;
    if (!pid) throw new Error('Profile not ready — please wait a moment and try again.');
    const saved = await dbCreateTask({ ...taskInput, user_id: pid });
    setTasks((prev) => {
      const updated = [...prev, saved];
      saveToCache(updated);
      return updated;
    });
  }, []);

  // editTask throws on failure so the caller can alert the user
  const editTask = useCallback(async (taskId: string, taskInput: any) => {
    const pid = profileIdRef.current;
    if (!pid) throw new Error('Profile not ready — please wait a moment and try again.');

    if (taskId.startsWith('local-')) {
      const saved = await dbCreateTask({ ...taskInput, user_id: pid });
      setTasks(prev => {
        const updated = prev.map(t => t.id === taskId ? saved : t);
        saveToCache(updated);
        return updated;
      });
      return;
    }

    await dbDeleteTask(taskId);
    const saved = await dbCreateTask({ ...taskInput, user_id: pid });
    setTasks(prev => {
      const updated = prev.map(t => t.id === taskId ? saved : t);
      saveToCache(updated);
      return updated;
    });
  }, []);

  const updateTaskState = useCallback(async (taskId: string, newStatus: any) => {
    const updatedTasks = tasks.map(t => t.id === taskId
      ? { ...t, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null }
      : t);
    setTasks(updatedTasks);
    saveToCache(updatedTasks);
    const pid = profileIdRef.current;
    if (pid && !taskId.startsWith('local-')) {
      try { await dbToggleTask(taskId, newStatus === 'completed' ? 'pending' : 'completed'); } catch {}
    }
  }, [tasks]);

  const removeTask = useCallback(async (taskId: string) => {
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    setTasks(updatedTasks);
    saveToCache(updatedTasks);
    const pid = profileIdRef.current;
    if (pid && !taskId.startsWith('local-')) {
      try { await dbDeleteTask(taskId); } catch {}
    }
  }, [tasks]);

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
