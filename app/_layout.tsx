import '../global.css';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/lib/auth';

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading || !segments[0]) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inCallbackRoute = segments[0] === 'auth'; // /auth/callback — let it finish

    // Clear any pending redirect before scheduling a new one
    if (redirectTimer.current) clearTimeout(redirectTimer.current);

    if (!user && !inAuthGroup && !inCallbackRoute) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Small delay lets the auth state fully settle before navigating
      redirectTimer.current = setTimeout(() => {
        router.replace('/(app)');
      }, 50);
    }

    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [user, isLoading, segments]);

  // Block rendering until auth state is confirmed — prevents dashboard flash
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0e0e1a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
