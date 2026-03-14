import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { insforge } from '../../src/lib/insforge';
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
        const session = (insforge.auth as any).tokenManager?.getSession?.();
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
