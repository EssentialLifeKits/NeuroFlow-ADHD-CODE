import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { useAuth } from './auth';

export type BillingStatus = {
  active: boolean;
  admin?: boolean;
  status: string;
  billingConfigured?: boolean;
  setupMode?: boolean;
  subscription?: {
    status?: string;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
  } | null;
};

type BillingContextValue = {
  status: BillingStatus | null;
  isLoading: boolean;
  error: string | null;
  hasAccess: boolean;
  refreshBilling: () => Promise<void>;
  startCheckout: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
};

const BillingContext = createContext<BillingContextValue | null>(null);

function normalizeEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText };
  }
}

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const email = normalizeEmail(user?.email);
  const userId = user?.id || '';
  const isDevBypass = userId === 'mock-dev-user' || email === 'dev@neuroflow.app';

  const refreshBilling = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ email, userId });
      const res = await fetch(`/api/subscription-status?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Unable to check subscription status.');
      if (typeof data.active !== 'boolean') throw new Error('Billing status response was not valid.');
      setStatus(data);
    } catch (e: any) {
      setError(e?.message || 'Unable to check subscription status.');
      setStatus({
        active: isDevBypass,
        status: isDevBypass ? 'dev' : 'unknown',
      });
    } finally {
      setIsLoading(false);
    }
  }, [email, isDevBypass, user, userId]);

  useEffect(() => {
    refreshBilling();
  }, [refreshBilling]);

  useEffect(() => {
    if (!user || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId || params.get('checkout') !== 'success') return;

    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        await fetch('/api/stripe-sync-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sessionId }),
        });
        if (!cancelled) await refreshBilling();
      } catch {}
      if (!cancelled) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshBilling, user]);

  const openUrl = useCallback(async (url: string) => {
    if (Platform.OS === 'web') {
      window.location.href = url;
      return;
    }
    const Linking = await import('react-native').then((m) => m.Linking);
    await Linking.openURL(url);
  }, []);

  const startCheckout = useCallback(async () => {
    setError(null);
    const token = await getAccessToken();
    const res = await fetch('/api/stripe-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email, userId }),
    });
    const data = await parseJson(res);
    if (!res.ok || !data.url) {
      const message = data.error || 'Unable to start checkout.';
      setError(message);
      throw new Error(message);
    }
    await openUrl(data.url);
  }, [email, openUrl, userId]);

  const openCustomerPortal = useCallback(async () => {
    setError(null);
    const token = await getAccessToken();
    const res = await fetch('/api/stripe-portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email }),
    });
    const data = await parseJson(res);
    if (!res.ok || !data.url) {
      const message = data.error || 'Unable to open billing portal.';
      setError(message);
      throw new Error(message);
    }
    await openUrl(data.url);
  }, [email, openUrl]);

  const value = useMemo<BillingContextValue>(() => ({
    status,
    isLoading,
    error,
    hasAccess: Boolean(status?.active),
    refreshBilling,
    startCheckout,
    openCustomerPortal,
  }), [error, isLoading, openCustomerPortal, refreshBilling, startCheckout, status]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used inside BillingProvider');
  return ctx;
}
