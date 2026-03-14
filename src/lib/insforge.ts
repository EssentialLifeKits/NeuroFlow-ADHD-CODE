import { createClient, type TokenStorage } from '@insforge/sdk';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Platform-aware TokenStorage:
 * - Native (iOS/Android): expo-secure-store (encrypted at rest)
 * - Web: localStorage (SecureStore has no web implementation)
 */
const secureStorage: TokenStorage = Platform.OS === 'web'
  ? {
      // SDK calls these synchronously — return values directly, no Promise wrapper
      getItem: (key: string) => localStorage.getItem(key) as any,
      setItem: (key: string, value: string) => { localStorage.setItem(key, value); },
      removeItem: (key: string) => { localStorage.removeItem(key); },
    }
  : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

const INSFORGE_URL = process.env.EXPO_PUBLIC_INSFORGE_URL ?? 'http://localhost:7130';

export const insforge = createClient({
  baseUrl: INSFORGE_URL,
  storage: secureStorage,
  autoRefreshToken: true,
  persistSession: true,
});
