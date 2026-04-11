import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Dev bypass mock — kept intact so existing dev workflow is unaffected
const MOCK_USER = {
  id: 'mock-dev-user',
  email: 'dev@neuroflow.app',
  user_metadata: { full_name: 'Developer', name: 'Developer' },
} as unknown as User;

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  signInWithEmail:  (email: string, password: string) => Promise<string | null>;
  signUp:           (email: string, password: string) => Promise<string | null>;
  resetPassword:    (email: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  refreshUser:      () => Promise<void>;
  devBypass:        () => void;
  signOut:          () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore persisted session on mount + subscribe to auth state changes
  useEffect(() => {
    // Get current session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));

    // Keep user state in sync with Supabase auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return error.message;
        if (data?.user) setUser(data.user);
        return null;
      } catch (e: any) {
        return e?.message ?? 'Sign-in failed';
      }
    }, []);

  const signUp = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return error.message;
        if (data?.user) setUser(data.user);
        return null;
      } catch (e: any) {
        return e?.message ?? 'Sign-up failed';
      }
    }, []);

  const resetPassword = useCallback(
    async (email: string): Promise<string | null> => {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: Platform.OS === 'web'
            ? window.location.origin + '/auth/callback'
            : 'neuroflow://auth/callback',
        });
        if (error) return error.message;
        return null;
      } catch (e: any) {
        return e?.message ?? 'Reset failed';
      }
    }, []);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    try {
      const redirectTo = Platform.OS === 'web'
        ? window.location.origin + '/auth/callback'
        : 'neuroflow://auth/callback';

      if (Platform.OS === 'web') {
        // Web: full redirect flow — Supabase handles PKCE automatically
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) return error.message;
        return null;
      }

      // Native: open browser, capture redirect, exchange code
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return error.message;
      if (!data?.url) return 'No OAuth URL returned';

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return 'Sign-in cancelled';

      // Extract code from redirect URL and exchange for session
      const url = result.url;
      const code = new URL(url).searchParams.get('code');
      if (!code) return 'No auth code in callback URL';

      const { data: sessionData, error: exchError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchError) return exchError.message;
      if (sessionData?.user) setUser(sessionData.user);
      return null;
    } catch (e: any) {
      return e?.message ?? 'Google sign-in failed';
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      } else {
        const { data: { user: u } } = await supabase.auth.getUser();
        setUser(u ?? null);
      }
    } catch {}
  }, []);

  const devBypass = useCallback(() => { setUser(MOCK_USER); }, []);

  const signOut = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch {}
    if (Platform.OS === 'web') {
      // Clear any lingering Supabase / legacy InsForge keys from localStorage
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') || k.startsWith('supabase') || k.includes('auth'))
        .forEach(k => localStorage.removeItem(k));
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithEmail, signUp, resetPassword, signInWithGoogle, refreshUser, devBypass, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
