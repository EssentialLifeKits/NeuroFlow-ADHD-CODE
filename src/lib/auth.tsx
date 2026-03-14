import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { UserSchema } from '@insforge/sdk';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { insforge } from './insforge';

WebBrowser.maybeCompleteAuthSession();

const MOCK_USER = {
  id: 'mock-dev-user',
  displayName: 'Developer',
  email: 'dev@neuroflow.app',
} as unknown as UserSchema;

interface AuthContextValue {
  user: UserSchema | null;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  refreshUser: () => Promise<void>;
  devBypass: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSchema | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore persisted session on mount — wrapped in try/catch so the app
  // doesn't crash when InsForge isn't reachable (e.g. during dev without .env).
  useEffect(() => {
    insforge.auth
      .getCurrentUser()
      .then(({ data }) => {
        setUser(data?.user ?? null);
      })
      .catch(() => {
        // Backend unreachable — stay signed out
      })
      .finally(() => setIsLoading(false));
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const { data, error } = await insforge.auth.signInWithPassword({
          email,
          password,
        });
        if (error) return error.message;
        if (data?.user) setUser(data.user);
        return null;
      } catch (e: any) {
        return e?.message ?? 'Sign-in failed';
      }
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const { data, error } = await insforge.auth.signUp({ email, password });
        if (error) return error.message;
        if (data?.user) setUser(data.user);
        return null;
      } catch (e: any) {
        return e?.message ?? 'Sign-up failed';
      }
    },
    [],
  );

  const resetPassword = useCallback(
    async (email: string): Promise<string | null> => {
      try {
        const { error } = await insforge.auth.sendResetPasswordEmail({ email });
        if (error) return error.message;
        return null;
      } catch (e: any) {
        return e?.message ?? 'Reset failed';
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    try {
      const redirectTo = Platform.OS === 'web'
        ? window.location.origin + '/auth/callback'
        : 'https://unvizd5j.us-east.insforge.app/api/auth/oauth/google/callback';

      if (Platform.OS === 'web') {
        // On web, do a full redirect to the OAuth URL
        const { data, error } = await insforge.auth.signInWithOAuth({
          provider: 'google',
          redirectTo,
        });
        if (error) return error.message;
        if (data?.url) window.location.href = data.url;
        return null;
      }

      // Native: PKCE flow
      const { data, error } = await insforge.auth.signInWithOAuth({
        provider: 'google',
        redirectTo,
        skipBrowserRedirect: true,
      });
      if (error) return error.message;
      if (!data?.url) return 'No OAuth URL returned';

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return 'Sign-in cancelled';

      const url = result.url;
      const code = new URL(url).searchParams.get('insforge_code');
      if (!code) return 'No auth code in callback URL';

      const { data: sessionData, error: exchError } = await (insforge.auth as any).exchangeOAuthCode(
        code,
        (data as any).codeVerifier,
      );
      if (exchError) return exchError.message;
      if (sessionData?.user) setUser(sessionData.user);
      return null;
    } catch (e: any) {
      return e?.message ?? 'Google sign-in failed';
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      // Use local session read — avoids network call that fails with 500
      const session = (insforge.auth as any).tokenManager.getSession();
      if (session?.user) {
        setUser(session.user);
      } else {
        // Fallback to network only if no local session
        const { data } = await insforge.auth.getCurrentUser();
        setUser(data?.user ?? null);
      }
    } catch {}
  }, []);

  const devBypass = useCallback(() => {
    setUser(MOCK_USER);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await insforge.auth.signOut();
    } catch {}
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, signInWithEmail, signUp, resetPassword, signInWithGoogle, refreshUser, devBypass, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
