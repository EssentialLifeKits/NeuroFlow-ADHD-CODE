import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { colors, spacing, typography } from '../../src/constants/theme';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const run = async () => {
      // Small delay ensures Root Layout has mounted before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        // On web, Supabase detects the code/token in the URL automatically.
        // On native, the code was already exchanged in auth.tsx signInWithGoogle.
        // Either way, just check if there's a valid session.
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await refreshUser();
          router.replace('/(app)');
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      }
    };

    run();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  text: {
    fontSize: typography.fontSizeMd,
    color: colors.textSecondary,
  },
});
