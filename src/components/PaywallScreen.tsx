import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../lib/auth';
import { useBilling } from '../lib/billing';
import { colors, radius, spacing } from '../constants/theme';

const NF_BLUE = '#4A90E2';
const CYAN = '#00C6FF';

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <View style={styles.feature}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureText}>{text}</Text>
      </View>
    </View>
  );
}

export default function PaywallScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 760;
  const { user, signOut } = useAuth();
  const { error, isLoading, refreshBilling, startCheckout, status } = useBilling();

  const periodEnd = status?.subscription?.current_period_end
    ? new Date(status.subscription.current_period_end).toLocaleDateString()
    : null;

  return (
    <View style={styles.root}>
      <View style={[styles.shell, isMobile && styles.shellMobile]}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/neuroflow-logo.png')} style={styles.logo} />
          <View>
            <Text style={styles.brand}>NeuroFlow Pro</Text>
            <Text style={styles.subBrand}>by Essential Life Kits</Text>
          </View>
        </View>

        <View style={[styles.content, isMobile && styles.contentMobile]}>
          <View style={styles.copy}>
            <Text style={styles.kicker}>Subscription required</Text>
            <Text style={[styles.title, isMobile && styles.titleMobile]}>
              Unlock your focus dashboard.
            </Text>
            <Text style={styles.body}>
              NeuroFlow Pro gives you the Dashboard, Calendar, Hyperfocus Lotus, smart reminders,
              downloadable videos, audio, PDFs, and focus resources in one private workspace.
            </Text>

            <View style={styles.featureList}>
              <Feature icon="🔔" title="Priority reminders" text="Schedule tasks and alerts that fire at the right time." />
              <Feature icon="🪷" title="Focus sessions" text="Track completed focus time and daily session progress." />
              <Feature icon="📚" title="Resource library" text="Download NeuroFlow videos, slide decks, PDFs, and audio." />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.planName}>NeuroFlow Pro</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>$9.99</Text>
              <Text style={styles.interval}>/ month</Text>
            </View>
            <Text style={styles.cardText}>
              Start or renew your subscription through Stripe secure checkout.
            </Text>

            {periodEnd ? (
              <Text style={styles.statusLine}>
                Current access through {periodEnd}
              </Text>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={startCheckout}
              disabled={isLoading}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, isLoading && styles.disabled]}
            >
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Subscribe with Stripe</Text>}
            </Pressable>

            <Pressable onPress={refreshBilling} style={styles.secondaryBtn}>
              <Text style={styles.secondaryText}>I already subscribed</Text>
            </Pressable>

            <Pressable onPress={signOut} style={styles.signOutBtn}>
              <Text style={styles.signOutText}>Use another account</Text>
            </Pressable>

            <Text style={styles.tiny}>
              Signed in as {user?.email || 'your account'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b0c12',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  shell: {
    width: '100%',
    maxWidth: 1040,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.28)',
    backgroundColor: '#161823',
    padding: 28,
  },
  shellMobile: {
    padding: 18,
    borderRadius: 18,
    alignSelf: 'stretch',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  logo: { width: 44, height: 44, borderRadius: 10 },
  brand: { color: NF_BLUE, fontSize: 26, fontWeight: '900' },
  subBrand: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  content: { flexDirection: 'row', gap: 28, alignItems: 'stretch' },
  contentMobile: { flexDirection: 'column' },
  copy: { flex: 1.15, justifyContent: 'center' },
  kicker: {
    color: CYAN,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  title: { color: colors.textPrimary, fontSize: 48, lineHeight: 54, fontWeight: '900', marginBottom: 16 },
  titleMobile: { fontSize: 34, lineHeight: 39 },
  body: { color: colors.textSecondary, fontSize: 17, lineHeight: 26, maxWidth: 600 },
  featureList: { marginTop: 26, gap: 12 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  featureIcon: { fontSize: 22 },
  featureTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  featureText: { color: colors.textTertiary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  card: {
    flex: 0.85,
    minWidth: 280,
    borderRadius: 18,
    backgroundColor: '#10131e',
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.34)',
    padding: 22,
    justifyContent: 'center',
  },
  planName: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', marginBottom: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  price: { color: colors.textPrimary, fontSize: 42, fontWeight: '900' },
  interval: { color: colors.textSecondary, fontSize: 16, marginBottom: 8, marginLeft: 5 },
  cardText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  statusLine: { color: '#34D399', fontSize: 13, fontWeight: '800', marginBottom: 12 },
  error: { color: '#ff7d7d', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  primaryBtn: {
    minHeight: 52,
    borderRadius: radius.full,
    backgroundColor: NF_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryBtn: {
    minHeight: 46,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryText: { color: NF_BLUE, fontSize: 14, fontWeight: '900' },
  signOutBtn: { alignItems: 'center', paddingVertical: 14 },
  signOutText: { color: colors.textTertiary, fontSize: 13, fontWeight: '800' },
  tiny: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.65 },
});
