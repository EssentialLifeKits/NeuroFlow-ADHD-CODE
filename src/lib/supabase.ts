/**
 * NeuroFlow — Supabase Client
 * Platform-aware session storage:
 *   - Native (iOS/Android): expo-secure-store
 *   - Web: localStorage (SecureStore has no web implementation)
 */

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Platform-aware storage adapter for Supabase auth sessions
const storage = Platform.OS === 'web'
  ? undefined  // Supabase defaults to localStorage on web — no adapter needed
  : {
      getItem:    (key: string) => SecureStore.getItemAsync(key),
      setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:          storage as any,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
